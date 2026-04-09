import Stripe from "stripe";
import { getDb } from "../db";
import { subscriptions, monthlyUsage } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { PlanId, BillingInterval, PLANS, getPlanLimits, STRIPE_PLAN_METADATA_KEY, STRIPE_INTERVAL_METADATA_KEY } from "./products";
import { sendPaymentConfirmationEmail } from "../utils/email.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-02-24.acacia" as any,
});

// ─── Price Cache ────────────────────────────────────────────────
// We create Stripe products/prices on-demand and cache them
const priceCache: Record<string, string> = {};

async function getOrCreatePrice(planId: PlanId, interval: BillingInterval): Promise<string> {
  const cacheKey = `${planId}_${interval}`;
  if (priceCache[cacheKey]) return priceCache[cacheKey];

  const plan = PLANS[planId];
  if (!plan || plan.monthlyPrice === 0) throw new Error("Cannot create price for free plan");

  const priceAmount = interval === "yearly" ? plan.yearlyTotal : plan.monthlyPrice;
  const recurringInterval = interval === "yearly" ? "year" : "month";

  // Search for existing price
  const existingPrices = await stripe.prices.search({
    query: `metadata["${STRIPE_PLAN_METADATA_KEY}"]:"${planId}" AND metadata["${STRIPE_INTERVAL_METADATA_KEY}"]:"${interval}" AND active:"true"`,
  });

  if (existingPrices.data.length > 0) {
    priceCache[cacheKey] = existingPrices.data[0].id;
    return existingPrices.data[0].id;
  }

  // Search for existing product
  const existingProducts = await stripe.products.search({
    query: `metadata["${STRIPE_PLAN_METADATA_KEY}"]:"${planId}" AND active:"true"`,
  });

  let productId: string;
  if (existingProducts.data.length > 0) {
    productId = existingProducts.data[0].id;
  } else {
    const product = await stripe.products.create({
      name: `SpyReels - ${plan.name}`,
      description: plan.description,
      metadata: { [STRIPE_PLAN_METADATA_KEY]: planId },
    });
    productId = product.id;
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: priceAmount,
    currency: "usd",
    recurring: { interval: recurringInterval },
    metadata: {
      [STRIPE_PLAN_METADATA_KEY]: planId,
      [STRIPE_INTERVAL_METADATA_KEY]: interval,
    },
  });

  priceCache[cacheKey] = price.id;
  return price.id;
}

// ─── Checkout ───────────────────────────────────────────────────
export async function createCheckoutSession(opts: {
  userId: number;
  email: string;
  name: string;
  planId: PlanId;
  interval: BillingInterval;
  origin: string;
}): Promise<string> {
  const { userId, email, name, planId, interval, origin } = opts;

  const priceId = await getOrCreatePrice(planId, interval);

  // Get or create Stripe customer
  let stripeCustomerId: string | undefined;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (sub?.stripeCustomerId) {
    stripeCustomerId = sub.stripeCustomerId;
  }

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email,
      name,
      metadata: { user_id: userId.toString() },
    });
    stripeCustomerId = customer.id;

    // Upsert subscription record with customer ID
    if (sub) {
      await db.update(subscriptions).set({ stripeCustomerId }).where(eq(subscriptions.userId, userId));
    } else {
      await db.insert(subscriptions).values({
        userId,
        plan: "free",
        stripeCustomerId,
        status: "active",
      });
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?success=true&plan=${planId}`,
    cancel_url: `${origin}/pricing?canceled=true`,
    allow_promotion_codes: true,
    client_reference_id: userId.toString(),
    metadata: {
      user_id: userId.toString(),
      customer_email: email,
      customer_name: name,
      plan_id: planId,
      billing_interval: interval,
    },
    subscription_data: {
      metadata: {
        user_id: userId.toString(),
        plan_id: planId,
        billing_interval: interval,
      },
    },
  });

  return session.url!;
}

// ─── Customer Portal ────────────────────────────────────────────
export async function createPortalSession(userId: number, origin: string): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!sub?.stripeCustomerId) throw new Error("No Stripe customer found");

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}/billing`,
  });

  return session.url;
}

// ─── Webhook Helpers ───────────────────────────────────────────

/** Safely parse a Stripe Unix timestamp to a Date, returning null if invalid */
function parseStripeTimestamp(ts: number | null | undefined): Date | null {
  if (!ts || ts <= 0) return null;
  const date = new Date(ts * 1000);
  // Sanity check: must be after year 2000
  if (date.getFullYear() < 2000) return null;
  return date;
}

/** Map Stripe subscription status to our enum */
function mapStripeStatus(stripeStatus: string): "active" | "canceled" | "past_due" | "trialing" {
  switch (stripeStatus) {
    case "active": return "active";
    case "past_due": return "past_due";
    case "trialing": return "trialing";
    default: return "canceled";
  }
}

/** Upsert subscription record — handles both insert and update to avoid race conditions */
async function upsertSubscription(db: any, userId: number, data: {
  plan: PlanId;
  billingInterval: BillingInterval;
  status: "active" | "canceled" | "past_due" | "trialing";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  cancelAtPeriodEnd: number;
  currentPeriodEnd: Date | null;
}) {
  // Try update first
  const result = await db.update(subscriptions).set({
    plan: data.plan,
    billingInterval: data.billingInterval,
    status: data.status,
    ...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
    ...(data.stripeSubscriptionId ? { stripeSubscriptionId: data.stripeSubscriptionId } : {}),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    ...(data.currentPeriodEnd ? { currentPeriodEnd: data.currentPeriodEnd } : {}),
  }).where(eq(subscriptions.userId, userId));

  // If no rows affected, the subscription record doesn't exist yet — insert it
  if (result[0]?.affectedRows === 0) {
    console.log(`[Stripe Webhook] No subscription found for userId ${userId}, creating one`);
    await db.insert(subscriptions).values({
      userId,
      plan: data.plan,
      billingInterval: data.billingInterval,
      status: data.status,
      stripeCustomerId: data.stripeCustomerId || null,
      stripeSubscriptionId: data.stripeSubscriptionId || null,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      currentPeriodEnd: data.currentPeriodEnd,
    }).onDuplicateKeyUpdate({
      set: {
        plan: data.plan,
        billingInterval: data.billingInterval,
        status: data.status,
        ...(data.stripeCustomerId ? { stripeCustomerId: data.stripeCustomerId } : {}),
        ...(data.stripeSubscriptionId ? { stripeSubscriptionId: data.stripeSubscriptionId } : {}),
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        ...(data.currentPeriodEnd ? { currentPeriodEnd: data.currentPeriodEnd } : {}),
      },
    });
  }
}

// ─── Webhook Handlers ───────────────────────────────────────────
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = parseInt(session.metadata?.user_id || session.client_reference_id || "0");
      const planId = (session.metadata?.plan_id || "pro") as PlanId;
      const interval = (session.metadata?.billing_interval || "monthly") as BillingInterval;

      if (userId && session.subscription) {
        const db = await getDb();
        if (!db) break;
        try {
          const stripeSubscription: any = await stripe.subscriptions.retrieve(session.subscription as string);
          const periodEnd = parseStripeTimestamp(stripeSubscription.current_period_end);
          await upsertSubscription(db, userId, {
            plan: planId,
            billingInterval: interval,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            status: "active",
            cancelAtPeriodEnd: 0,
            currentPeriodEnd: periodEnd,
          });
          console.log(`[Stripe Webhook] checkout.session.completed: userId=${userId}, plan=${planId}, interval=${interval}`);
          const customerEmail = session.metadata?.customer_email;
          const customerName = session.metadata?.customer_name || "there";
          const firstName = customerName.split(" ")[0];
          const plan = PLANS[planId];
          const planName = plan ? plan.name + " Plan" : planId + " Plan";
          const planPrice = plan ? (interval === "yearly" ? (plan.yearlyTotal / 100 / 12).toFixed(2) : (plan.monthlyPrice / 100).toFixed(2)) : "0";
          const nextBilling = periodEnd ? periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "next month";
          if (customerEmail) {
            sendPaymentConfirmationEmail(customerEmail, firstName, planName, planPrice, nextBilling).catch(console.warn);
          }
        } catch (err: any) {
          console.error(`[Stripe Webhook] Error processing checkout.session.completed: ${err.message}`);
          throw err;
        }
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription: any = event.data.object;
      const userId = parseInt(subscription.metadata?.user_id || "0");
      if (!userId) {
        console.log(`[Stripe Webhook] Skipping ${event.type}: no user_id in metadata`);
        break;
      }
      const db = await getDb();
      if (!db) break;

      const planId = (subscription.metadata?.plan_id || "pro") as PlanId;
      const interval = (subscription.metadata?.billing_interval || "monthly") as BillingInterval;
      const status = mapStripeStatus(subscription.status);
      const periodEnd = parseStripeTimestamp(subscription.current_period_end);

      try {
        await upsertSubscription(db, userId, {
          plan: planId,
          billingInterval: interval,
          status,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id,
          cancelAtPeriodEnd: subscription.cancel_at_period_end ? 1 : 0,
          currentPeriodEnd: periodEnd,
        });
        console.log(`[Stripe Webhook] ${event.type}: userId=${userId}, plan=${planId}, status=${status}`);
      } catch (err: any) {
        console.error(`[Stripe Webhook] Error processing ${event.type}: ${err.message}`);
        throw err;
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription: any = event.data.object;
      const userId = parseInt(subscription.metadata?.user_id || "0");
      if (!userId) break;
      const dbDel = await getDb();
      if (!dbDel) break;

      try {
        await upsertSubscription(dbDel, userId, {
          plan: "free",
          billingInterval: "monthly",
          status: "canceled",
          cancelAtPeriodEnd: 0,
          currentPeriodEnd: null,
        });
        // Clear the subscription ID
        await dbDel.update(subscriptions).set({
          stripeSubscriptionId: null,
        }).where(eq(subscriptions.userId, userId));
        console.log(`[Stripe Webhook] customer.subscription.deleted: userId=${userId}, reverted to free`);
      } catch (err: any) {
        console.error(`[Stripe Webhook] Error processing customer.subscription.deleted: ${err.message}`);
        throw err;
      }
      break;
    }

    case "invoice.paid": {
      // Reset monthly usage on successful payment (new billing cycle)
      const invoice: any = event.data.object;
      if (invoice.subscription) {
        try {
          const sub: any = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const userId = parseInt(sub.metadata?.user_id || "0");
          if (userId) {
            const db = await getDb();
            if (!db) break;
            const currentMonth = new Date().toISOString().slice(0, 7);
            await db.insert(monthlyUsage).values({
              userId,
              usageMonth: currentMonth,
            }).onDuplicateKeyUpdate({
              set: {
                scrapeCount: 0,
                searchCount: 0,
                transcribeCount: 0,
                recreateCount: 0,
                rewriteCount: 0,
                exportCount: 0,
                extensionSortCount: 0,
                extensionSaveCount: 0,
                extensionTranscribeCount: 0,
                extensionRecreateCount: 0,
              },
            });
            console.log(`[Stripe Webhook] invoice.paid: userId=${userId}, usage reset for ${currentMonth}`);
          }
        } catch (err: any) {
          console.error(`[Stripe Webhook] Error processing invoice.paid: ${err.message}`);
          throw err;
        }
      }
      break;
    }

    case "payment_intent.succeeded": {
      // Informational only — actual subscription updates handled by other events
      const paymentIntent: any = event.data.object;
      console.log(`[Stripe Webhook] payment_intent.succeeded: ${paymentIntent.id}, amount=${paymentIntent.amount}`);
      break;
    }

    default:
      console.log(`[Stripe Webhook] Unhandled event: ${event.type}`);
  }
}

// ─── Usage Tracking ─────────────────────────────────────────────
type UsageField = 
  | "scrapeCount" | "searchCount" | "transcribeCount" 
  | "recreateCount" | "rewriteCount" | "exportCount"
  | "extensionSortCount" | "extensionSaveCount" 
  | "extensionTranscribeCount" | "extensionRecreateCount";

export async function incrementUsage(userId: number, field: UsageField, amount: number = 1): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  await db.insert(monthlyUsage).values({
    userId,
    usageMonth: currentMonth,
    [field]: amount,
  }).onDuplicateKeyUpdate({
    set: {
      [field]: sql`${monthlyUsage[field]} + ${amount}`,
    },
  });
}

export async function getMonthlyUsage(userId: number): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return { scrapeCount: 0, searchCount: 0, transcribeCount: 0, recreateCount: 0, rewriteCount: 0, exportCount: 0, extensionSortCount: 0, extensionSaveCount: 0, extensionTranscribeCount: 0, extensionRecreateCount: 0 };
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [usage] = await db.select().from(monthlyUsage)
    .where(and(eq(monthlyUsage.userId, userId), eq(monthlyUsage.usageMonth, currentMonth)))
    .limit(1);

  if (!usage) {
    return {
      scrapeCount: 0, searchCount: 0, transcribeCount: 0,
      recreateCount: 0, rewriteCount: 0, exportCount: 0,
      extensionSortCount: 0, extensionSaveCount: 0,
      extensionTranscribeCount: 0, extensionRecreateCount: 0,
    };
  }

  return {
    scrapeCount: usage.scrapeCount,
    searchCount: usage.searchCount,
    transcribeCount: usage.transcribeCount,
    recreateCount: usage.recreateCount,
    rewriteCount: usage.rewriteCount,
    exportCount: usage.exportCount,
    extensionSortCount: usage.extensionSortCount,
    extensionSaveCount: usage.extensionSaveCount,
    extensionTranscribeCount: usage.extensionTranscribeCount,
    extensionRecreateCount: usage.extensionRecreateCount,
  };
}

// ─── Subscription Helpers ───────────────────────────────────────
export async function getUserSubscription(userId: number) {
  const db = await getDb();
  if (!db) return { plan: "free" as PlanId, status: "active", billingInterval: "monthly" as BillingInterval, cancelAtPeriodEnd: false, currentPeriodEnd: null };
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  
  if (!sub) {
    // Auto-create free subscription
    await db.insert(subscriptions).values({
      userId,
      plan: "free",
      status: "active",
    });
    return { plan: "free" as PlanId, status: "active", billingInterval: "monthly" as BillingInterval, cancelAtPeriodEnd: false, currentPeriodEnd: null };
  }

  return {
    plan: sub.plan as PlanId,
    status: sub.status,
    billingInterval: (sub.billingInterval || "monthly") as BillingInterval,
    cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
    currentPeriodEnd: sub.currentPeriodEnd,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId: sub.stripeSubscriptionId,
  };
}

/**
 * Check if user can perform an action based on their plan limits.
 * Returns { allowed: boolean, limit: number, used: number, planRequired?: PlanId }
 */
export async function checkUsageLimit(
  userId: number, 
  action: UsageField,
  userOpenId?: string
): Promise<{ allowed: boolean; limit: number; used: number; planRequired?: PlanId }> {
  // Owner/admin bypass — unlimited access
  const ownerOpenId = process.env.OWNER_OPEN_ID;
  if (ownerOpenId && userOpenId === ownerOpenId) {
    return { allowed: true, limit: 999999, used: 0 };
  }

  const sub = await getUserSubscription(userId);
  const limits = getPlanLimits(sub.plan as PlanId);
  const usage = await getMonthlyUsage(userId);

  // Map action to limit field
  const limitMap: Record<UsageField, keyof typeof limits> = {
    scrapeCount: "scrapesPerMonth",
    searchCount: "searchesPerDay",
    transcribeCount: "transcriptionsPerMonth",
    recreateCount: "recreatesPerMonth",
    rewriteCount: "rewritesPerScript",
    exportCount: "scrapesPerMonth", // reuse scrape limit for exports
    extensionSortCount: "extSortsPerDay",
    extensionSaveCount: "extSavesPerDay",
    extensionTranscribeCount: "extTranscribesPerMonth",
    extensionRecreateCount: "extRecreatesPerMonth",
  };

  const limitKey = limitMap[action];
  const limit = limits[limitKey] as number;
  const used = usage[action] || 0;

  if (used >= limit) {
    // Find the next tier that would allow this
    const planOrder: PlanId[] = ["free", "starter", "pro", "business", "agency"];
    const currentIdx = planOrder.indexOf(sub.plan);
    const planRequired = planOrder.find((p, i) => {
      if (i <= currentIdx) return false;
      const pLimits = getPlanLimits(p);
      return (pLimits[limitKey] as number) > limit;
    });

    return { allowed: false, limit, used, planRequired: planRequired || "agency" };
  }

  return { allowed: true, limit, used };
}

// ─── Stripe Webhook Signature Verification ──────────────────────
export function constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET || ""
  );
}

export { stripe };
