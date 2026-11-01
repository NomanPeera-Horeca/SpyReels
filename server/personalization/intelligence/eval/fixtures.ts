/**
 * Personalization intelligence evaluation set: 30 creator profiles.
 *
 * ALL PROFILES ARE SYNTHETIC. Names, handles, bios and captions were written
 * for this evaluation and do not describe real accounts or people. No paid
 * scraping was used. Each case states what a good result must and must not
 * do, so outputs can be judged against evidence instead of taste.
 *
 * `fallbackGoal` / `fallbackAudiences` model the user's confirmation step:
 * when the engine asks for clarification (or for later steps), the harness
 * continues with what a user in that scenario would type.
 */
import type { StarterAnswers } from "@shared/personalization/starterQuestions";
import type {
  AnalysisSourceSnapshot,
  AudiencePayload,
  NichePayload,
  SocialPlatform,
  SocialProfileStatus,
} from "@shared/personalization/model";

export type EvalCategory =
  | "restaurant_local"
  | "fitness_health"
  | "personal_brand"
  | "entertainment"
  | "travel_lifestyle_family"
  | "education_services"
  | "small_new"
  | "ambiguous_multilingual"
  | "real_customer";

export type EvalCase = {
  id: string;
  category: EvalCategory;
  /** false only for real-customer replays loaded at run time (never committed). */
  synthetic: boolean;
  platform: SocialPlatform | null;
  displayName: string | null;
  bio: string | null;
  /** Newest first. Empty = zero public posts. null = private / no access. */
  captions: string[] | null;
  language?: { code: string; label: string };
  expect: {
    /** Does the evidence show the creator sells something? */
    commercial: boolean;
    /** required = the engine must ask; allowed = asking is acceptable; no = it should suggest. */
    clarification: "required" | "allowed" | "no";
    /** Themes a good goal should reflect (any). Used by reviewers, not as a hard match. */
    goalThemes: string[];
    notes: string;
  };
  fallbackGoal: string;
  fallbackAudiences: AudiencePayload[];
  /** Real-customer replays: the stored analysis snapshot, used as is. */
  snapshot?: AnalysisSourceSnapshot | null;
  /** Real-customer replays: the profile status production had. */
  profileStatus?: SocialProfileStatus;
  /** Real-customer replays: the niche the customer picked ("I don't post yet"). */
  typedNiche?: NichePayload;
  /** Starter-question answers given by (or simulated for) the creator. */
  starter?: StarterAnswers;
  /** Real-customer replays: what the AI first showed this customer in onboarding. */
  productionShown?: ProductionShown;
};

export type ProductionShown = {
  niche: string | null;
  goal: string | null;
  audiences: Array<{ who: string; outcome: string }>;
  pillars: Array<{ title: string; description: string }>;
};

const many = (base: string[], n: number) =>
  Array.from({ length: n }, (_, i) => base[i % base.length]);

export const EVAL_CASES: EvalCase[] = [
  // ---------------- Restaurant and local businesses (5) ----------------
  {
    id: "RL-01",
    category: "restaurant_local",
    synthetic: true,
    platform: "instagram",
    displayName: "Ironline Kitchen Supply",
    bio: "Commercial kitchen equipment for restaurants, cafes and food trucks. Free kitchen layout design. Financing available. DM for a quote.",
    captions: many(
      [
        "How to pick the right fryer for a busy line",
        "3 mistakes new owners make with walk-in coolers",
        "Combi oven vs convection oven for small kitchens",
        "Before and after: a full cafe kitchen build",
        "What a free kitchen layout consult looks like",
      ],
      15
    ),
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["help owners choose equipment", "grow equipment business"],
      notes: "Clear B2B seller. Business goal is supported.",
    },
    fallbackGoal:
      "Help restaurant owners choose the right equipment and grow my business.",
    fallbackAudiences: [
      { who: "Restaurant owners", outcome: "equip their kitchens" },
    ],
  },
  {
    id: "RL-02",
    category: "restaurant_local",
    synthetic: true,
    platform: "tiktok",
    displayName: "Mama Lucia's Trattoria",
    bio: "Family-run Italian restaurant since 1998. Handmade pasta daily. Reservations at the link.",
    captions: many(
      [
        "Rolling 200 ravioli before service",
        "Nonna's sauce, no shortcuts",
        "Friday night rush in the kitchen",
        "Our new seasonal menu",
      ],
      12
    ),
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["bring diners in", "show the restaurant's food"],
      notes: "Local restaurant: goal is to attract diners, not 'help owners'.",
    },
    fallbackGoal:
      "Show off our handmade Italian food and bring more diners to the restaurant.",
    fallbackAudiences: [
      { who: "Local diners", outcome: "find a great Italian dinner" },
    ],
  },
  {
    id: "RL-03",
    category: "restaurant_local",
    synthetic: true,
    platform: "instagram",
    displayName: "Bloom & Stem Florist",
    bio: "Wedding and event flowers. Same-day delivery in town.",
    captions: [
      "Bridal bouquet with garden roses",
      "Setting up a 200-guest reception",
      "Behind the scenes on Valentine's week",
    ],
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["win wedding and event orders"],
      notes: "Fewer than 10 posts, short bio, clear business.",
    },
    fallbackGoal: "Show our wedding and event flowers to win more bookings.",
    fallbackAudiences: [
      { who: "Couples planning weddings", outcome: "choose their flowers" },
    ],
  },
  {
    id: "RL-04",
    category: "restaurant_local",
    synthetic: true,
    platform: "instagram",
    displayName: "Crust Bros Pizza Truck",
    bio: "Wood-fired pizza truck. Find our weekly locations here. Private events available.",
    captions: [],
    expect: {
      commercial: true,
      clarification: "allowed",
      goalThemes: ["bring customers to the truck", "book events"],
      notes: "Zero public posts. Bio alone.",
    },
    fallbackGoal:
      "Tell people where our pizza truck is each week and book more private events.",
    fallbackAudiences: [
      { who: "Local food lovers", outcome: "find the truck" },
    ],
  },
  {
    id: "RL-05",
    category: "restaurant_local",
    synthetic: true,
    platform: "youtube",
    displayName: "Sunrise Bakehouse",
    bio: "Neighborhood bakery. Sourdough, croissants, custom cakes. Order cakes online.",
    captions: many(
      [
        "Shaping 80 sourdough loaves at 4am",
        "Laminating croissant dough step by step",
        "Custom birthday cake reveal",
        "Why our sourdough takes 36 hours",
      ],
      14
    ),
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["attract local customers", "cake orders"],
      notes: "Established history, clear seller.",
    },
    fallbackGoal:
      "Show how we bake to bring in local customers and cake orders.",
    fallbackAudiences: [
      { who: "Neighborhood customers", outcome: "find fresh bread and cakes" },
    ],
  },

  // ---------------- Fitness, health and coaching (4) ----------------
  {
    id: "FH-01",
    category: "fitness_health",
    synthetic: true,
    platform: "instagram",
    displayName: "Coach Dani Strength",
    bio: "Online strength coach for busy professionals. 1:1 coaching spots open. Apply via link.",
    captions: many(
      [
        "20 minute full body workout",
        "How I program for clients with no time",
        "Squat form fixes",
        "Client check-in: 6 months of progress",
      ],
      15
    ),
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["help people get stronger", "attract coaching clients"],
      notes: "Commercial coaching is supported.",
    },
    fallbackGoal: "Help busy people get stronger and attract coaching clients.",
    fallbackAudiences: [
      { who: "Busy professionals", outcome: "build strength with little time" },
    ],
  },
  {
    id: "FH-02",
    category: "fitness_health",
    synthetic: true,
    platform: "tiktok",
    displayName: "Running with Theo",
    bio: "Amateur marathoner documenting the road to my first sub-4.",
    captions: many(
      [
        "Week 12 long run, 30km",
        "What I eat the night before a long run",
        "Shin splints update",
        "Race day nerves",
      ],
      11
    ),
    expect: {
      commercial: false,
      clarification: "no",
      goalThemes: ["document training journey", "motivate other runners"],
      notes: "Personal journey. No business objective may be added.",
    },
    fallbackGoal: "Share my marathon training to motivate other runners.",
    fallbackAudiences: [
      { who: "New runners", outcome: "train for their first marathon" },
    ],
  },
  {
    id: "FH-03",
    category: "fitness_health",
    synthetic: true,
    platform: "instagram",
    displayName: "Nourish with Priya, RD",
    bio: "Registered dietitian. Simple, evidence-based nutrition. Not medical advice.",
    captions: many(
      [
        "Protein at breakfast, made easy",
        "Myth: carbs at night",
        "Reading a nutrition label in 30 seconds",
        "High-fiber snacks under 5 minutes",
      ],
      13
    ),
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["educate people on nutrition"],
      notes: "Professional educator. No visible offer, so no sales goal.",
    },
    fallbackGoal:
      "Teach simple, evidence-based nutrition people can actually follow.",
    fallbackAudiences: [
      {
        who: "People confused by nutrition advice",
        outcome: "eat better without fads",
      },
    ],
  },
  {
    id: "FH-04",
    category: "fitness_health",
    synthetic: true,
    platform: "youtube",
    displayName: "Gentle Yoga Studio",
    bio: "Yoga classes in studio and online. Beginners welcome. Book a class on our site.",
    captions: ["10 minute morning stretch", "Yoga for lower back relief"],
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["help beginners start yoga", "fill classes"],
      notes: "Fewer than 10 posts, clear booking signal.",
    },
    fallbackGoal:
      "Help beginners feel comfortable with yoga and book more classes.",
    fallbackAudiences: [
      { who: "Yoga beginners", outcome: "start a gentle practice" },
    ],
  },

  // ---------------- Personal brands and entrepreneurs (4) ----------------
  {
    id: "PB-01",
    category: "personal_brand",
    synthetic: true,
    platform: "instagram",
    displayName: "Maya Chen | Founder",
    bio: "Building a skincare brand from my kitchen to 40 stores. Sharing every lesson.",
    captions: many(
      [
        "How we got into our first retail store",
        "Our first batch failed. Here's why.",
        "Pricing lessons from year one",
        "Hiring our first employee",
      ],
      15
    ),
    expect: {
      commercial: true,
      clarification: "allowed",
      goalThemes: ["share founder lessons", "build the brand"],
      notes: "Founder story. Business is real but the content is lessons.",
    },
    fallbackGoal: "Share honest lessons from building my skincare brand.",
    fallbackAudiences: [
      { who: "Early-stage founders", outcome: "avoid costly mistakes" },
    ],
  },
  {
    id: "PB-02",
    category: "personal_brand",
    synthetic: true,
    platform: "tiktok",
    displayName: "Jordan Builds",
    bio: "Software engineer turned indie hacker. Shipping small apps in public.",
    captions: many(
      [
        "Day 30 of building in public",
        "My app made its first $100",
        "Tech stack for solo founders",
        "Why I quit my job",
      ],
      12
    ),
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["build in public", "inspire indie makers"],
      notes: "No explicit offer; '$100' appears in captions only.",
    },
    fallbackGoal: "Build my apps in public and inspire other indie makers.",
    fallbackAudiences: [
      { who: "Aspiring indie hackers", outcome: "ship their first app" },
    ],
  },
  {
    id: "PB-03",
    category: "personal_brand",
    synthetic: true,
    platform: "instagram",
    displayName: "Lena Ortiz Realty",
    bio: "Real estate agent. Helping first-time buyers find their home. Call or DM to tour.",
    captions: many(
      [
        "Home tour under budget",
        "5 questions to ask before an offer",
        "What closing costs really are",
        "First-time buyer success story",
      ],
      13
    ),
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["help first-time buyers", "win clients"],
      notes: "Clear service business.",
    },
    fallbackGoal:
      "Help first-time buyers feel confident and find clients who want to buy.",
    fallbackAudiences: [
      { who: "First-time home buyers", outcome: "buy without surprises" },
    ],
  },
  {
    id: "PB-04",
    category: "personal_brand",
    synthetic: true,
    platform: "youtube",
    displayName: "Sam Rivera",
    bio: "Thoughts on work, money and life.",
    captions: ["Why I stopped hustling", "What I learned turning 30"],
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["share reflections"],
      notes: "Vague bio, few posts. Clarifying is reasonable.",
    },
    fallbackGoal:
      "Share honest reflections on work and life that help people slow down.",
    fallbackAudiences: [
      { who: "Young professionals", outcome: "find a healthier pace" },
    ],
  },

  // ---------------- Entertainment, AI stories and humor (4) ----------------
  {
    id: "EN-01",
    category: "entertainment",
    synthetic: true,
    platform: "tiktok",
    displayName: "Tales by Nova",
    bio: "Original AI-generated short stories. Sci-fi, mystery, suspense. New episode daily.",
    captions: many(
      [
        "Part 4: the signal from the dark side of the moon",
        "Part 5: who opened the airlock?",
        "The last library on Earth",
        "A story in 60 seconds: the clockmaker",
      ],
      15
    ),
    expect: {
      commercial: false,
      clarification: "no",
      goalThemes: ["entertain with original AI stories"],
      notes: "Must NOT get a business goal.",
    },
    fallbackGoal: "Entertain viewers with original AI-generated stories.",
    fallbackAudiences: [
      {
        who: "People who enjoy short fictional stories",
        outcome: "be entertained",
      },
    ],
  },
  {
    id: "EN-02",
    category: "entertainment",
    synthetic: true,
    platform: "instagram",
    displayName: "Office Chaos Comedy",
    bio: "Sketches about the corporate life you know too well.",
    captions: many(
      [
        "When the meeting could have been an email",
        "New hire vs 10-year employee",
        "The printer has feelings",
        "Reply-all disaster",
      ],
      14
    ),
    expect: {
      commercial: false,
      clarification: "no",
      goalThemes: ["make office workers laugh"],
      notes: "Humor, non-commercial.",
    },
    fallbackGoal:
      "Make office workers laugh at the everyday chaos of corporate life.",
    fallbackAudiences: [{ who: "Office workers", outcome: "laugh about work" }],
  },
  {
    id: "EN-03",
    category: "entertainment",
    synthetic: true,
    platform: "youtube",
    displayName: "PixelPaws",
    bio: "Funny pet edits. Link in bio for my favorite pet products.",
    captions: many(
      [
        "Cat vs cucumber, slow motion",
        "Dog learns the doorbell",
        "Hamster heist",
        "When the treat bag opens",
      ],
      12
    ),
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["entertain with pet clips"],
      notes:
        "Affiliate link only. A 'grow my business' goal would overreach; 'link in bio' alone is not a business.",
    },
    fallbackGoal: "Make people smile with funny pet moments.",
    fallbackAudiences: [
      { who: "Pet lovers", outcome: "enjoy funny animal clips" },
    ],
  },
  {
    id: "EN-04",
    category: "entertainment",
    synthetic: true,
    platform: "tiktok",
    displayName: "Magic Mo",
    bio: "Close-up magic. Book me for your event.",
    captions: ["Coin vanish at a wedding", "Card trick on the street"],
    expect: {
      commercial: true,
      clarification: "allowed",
      goalThemes: ["amaze viewers", "book event shows"],
      notes: "Entertainer who also sells bookings. Few posts.",
    },
    fallbackGoal: "Amaze people with close-up magic and book more event shows.",
    fallbackAudiences: [
      { who: "Event planners", outcome: "find memorable entertainment" },
    ],
  },

  // ---------------- Travel, lifestyle and family (4) ----------------
  {
    id: "TL-01",
    category: "travel_lifestyle_family",
    synthetic: true,
    platform: "youtube",
    displayName: "Wandering Lee",
    bio: "Slow travel diaries from small towns and big cities.",
    captions: many(
      [
        "Sunrise in a mountain village",
        "Street food night walk",
        "How I pack for two weeks",
        "Trains across the countryside",
      ],
      14
    ),
    expect: {
      commercial: false,
      clarification: "no",
      goalThemes: ["share travel experiences", "inspire exploring"],
      notes: "Non-commercial travel.",
    },
    fallbackGoal:
      "Share travel experiences and inspire people to explore new places.",
    fallbackAudiences: [
      { who: "Curious travelers", outcome: "plan slower trips" },
    ],
  },
  {
    id: "TL-02",
    category: "travel_lifestyle_family",
    synthetic: true,
    platform: "instagram",
    displayName: "The Okafor Five",
    bio: "Family of five. Real life, big messes, small wins.",
    captions: many(
      [
        "Morning routine with three kids under 8",
        "Our budget grocery haul",
        "Road trip survival kit",
        "Bedtime chaos",
      ],
      13
    ),
    expect: {
      commercial: false,
      clarification: "no",
      goalThemes: ["share real family life", "relate to other parents"],
      notes:
        "Family creator. 'Kids' appears in evidence, so family terms are supported.",
    },
    fallbackGoal: "Share real family life so other parents feel less alone.",
    fallbackAudiences: [
      { who: "Parents of young kids", outcome: "feel understood" },
    ],
  },
  {
    id: "TL-03",
    category: "travel_lifestyle_family",
    synthetic: true,
    platform: "tiktok",
    displayName: "Minimal Home by Ana",
    bio: "Decluttering and small-space living. Shop my home picks.",
    captions: many(
      [
        "Kitchen declutter in 15 minutes",
        "Small closet makeover",
        "What I stopped buying",
        "Studio apartment tour",
      ],
      12
    ),
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["help people simplify their homes"],
      notes:
        "Affiliate shop link only (same policy as EN-03): not a business objective. Main purpose is helping people simplify.",
    },
    fallbackGoal: "Help people simplify their homes and live with less.",
    fallbackAudiences: [
      { who: "People in small spaces", outcome: "make their home feel calmer" },
    ],
  },
  {
    id: "TL-04",
    category: "travel_lifestyle_family",
    synthetic: true,
    platform: null,
    displayName: "Hike with June",
    bio: "Weekend hikes and trail tips.",
    captions: null,
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["share hikes", "help people hike"],
      notes: "Private account: bio only.",
    },
    fallbackGoal: "Share weekend hikes and tips that help people get outdoors.",
    fallbackAudiences: [{ who: "Weekend hikers", outcome: "find good trails" }],
  },

  // ---------------- Education and professional services (3) ----------------
  {
    id: "ES-01",
    category: "education_services",
    synthetic: true,
    platform: "instagram",
    displayName: "Ms. Patel Teaches Math",
    bio: "High school math teacher. Making algebra less scary.",
    captions: many(
      [
        "Solve for x in 30 seconds",
        "Fractions trick your teacher never showed you",
        "Why we learn quadratics",
        "Exam week study plan",
      ],
      14
    ),
    expect: {
      commercial: false,
      clarification: "no",
      goalThemes: ["make math easier to learn"],
      notes: "Educator, non-commercial.",
    },
    fallbackGoal: "Make math less scary and easier to learn.",
    fallbackAudiences: [
      { who: "Students who struggle with math", outcome: "pass their exams" },
    ],
  },
  {
    id: "ES-02",
    category: "education_services",
    synthetic: true,
    platform: "tiktok",
    displayName: "Ledger & Co. Accounting",
    bio: "Bookkeeping and tax prep for small businesses. Free 15-minute consult.",
    captions: many(
      [
        "Deductions most small businesses miss",
        "How to separate business and personal money",
        "Quarterly taxes explained",
        "What a bookkeeper actually does",
      ],
      12
    ),
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["help small businesses with money", "win clients"],
      notes: "Professional service, clear offer.",
    },
    fallbackGoal:
      "Help small business owners understand their money and find new clients.",
    fallbackAudiences: [
      { who: "Small business owners", outcome: "stay on top of taxes" },
    ],
  },
  {
    id: "ES-03",
    category: "education_services",
    synthetic: true,
    platform: "youtube",
    displayName: "Learn Spanish with Carlos",
    bio: "Spanish lessons for English speakers. Courses available.",
    captions: [
      "Ordering food in Spanish",
      "Ser vs estar, simply",
      "Common mistakes English speakers make",
    ],
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["teach Spanish", "sell courses"],
      notes: "Few posts, course offer.",
    },
    fallbackGoal: "Teach practical Spanish and grow my course students.",
    fallbackAudiences: [
      {
        who: "English speakers learning Spanish",
        outcome: "hold real conversations",
      },
    ],
  },

  // ---------------- Small / new creators (3) ----------------
  {
    id: "SN-01",
    category: "small_new",
    synthetic: true,
    platform: "instagram",
    displayName: null,
    bio: null,
    captions: [],
    expect: {
      commercial: false,
      clarification: "required",
      goalThemes: [],
      notes: "No bio, no posts: must ask, must not call the model.",
    },
    fallbackGoal: "Share my cooking journey as I learn to make healthy meals.",
    fallbackAudiences: [
      { who: "Beginner home cooks", outcome: "cook healthier meals" },
    ],
  },
  {
    id: "SN-02",
    category: "small_new",
    synthetic: true,
    platform: "tiktok",
    displayName: "kai.makes",
    bio: "just starting out",
    captions: ["first video lol", "trying a new camera"],
    expect: {
      commercial: false,
      clarification: "required",
      goalThemes: [],
      notes: "No usable purpose in evidence. Should ask.",
    },
    fallbackGoal:
      "Document learning video editing and share what I figure out.",
    fallbackAudiences: [
      { who: "New video creators", outcome: "learn editing basics" },
    ],
  },
  {
    id: "SN-03",
    category: "small_new",
    synthetic: true,
    platform: "instagram",
    displayName: "Rosa's Crochet Corner",
    bio: "Learning to crochet one stitch at a time.",
    captions: ["My first granny square", "Attempting a beanie"],
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["share crochet learning journey"],
      notes: "Few posts but a clear hobby purpose.",
    },
    fallbackGoal:
      "Share my crochet learning journey and encourage other beginners.",
    fallbackAudiences: [
      { who: "Crochet beginners", outcome: "finish their first projects" },
    ],
  },

  // ---------------- Ambiguous and multilingual (3) ----------------
  {
    id: "AM-01",
    category: "ambiguous_multilingual",
    synthetic: true,
    platform: "instagram",
    displayName: "Cocina con Ana",
    bio: "Recetas faciles para cocinar en casa todos los dias. Pedidos de pasteles por DM.",
    captions: many(
      [
        "Tortilla de patatas en 10 minutos",
        "Paella para principiantes",
        "Flan casero sin horno",
        "Mi pastel de cumpleanos favorito",
      ],
      12
    ),
    language: { code: "es", label: "Spanish" },
    expect: {
      commercial: true,
      clarification: "no",
      goalThemes: ["teach easy home recipes", "cake orders"],
      notes: "Spanish bio and output. Cake orders by DM = commercial.",
    },
    fallbackGoal:
      "Ensenar recetas faciles para cocinar en casa y recibir mas pedidos de pasteles.",
    fallbackAudiences: [
      {
        who: "Personas que cocinan en casa",
        outcome: "preparar comidas faciles",
      },
    ],
  },
  {
    id: "AM-02",
    category: "ambiguous_multilingual",
    synthetic: true,
    platform: "tiktok",
    displayName: "zaynab.daily",
    bio: "مدونة يومية عن الحياة والدراسة والقهوة",
    captions: many(
      ["يوم دراسي طويل", "أفضل مقهى للمذاكرة", "روتيني الصباحي"],
      9
    ),
    expect: {
      commercial: false,
      clarification: "allowed",
      goalThemes: ["share daily student life"],
      notes: "Arabic bio and captions. Use the creator\'s detected or confirmed language for generated output unless explicitly changed. Lifestyle and study; no business.",
    },
    fallbackGoal: "Share my daily study life to motivate other students.",
    fallbackAudiences: [
      { who: "University students", outcome: "stay motivated to study" },
    ],
  },
  {
    id: "AM-03",
    category: "ambiguous_multilingual",
    synthetic: true,
    platform: "instagram",
    displayName: "M.",
    bio: "✨ vibes ✨ links below",
    captions: ["sunset", "new fit", "coffee", "beach day", "random"],
    expect: {
      commercial: false,
      clarification: "required",
      goalThemes: [],
      notes: "Ambiguous: no purpose visible. Must ask, not invent.",
    },
    fallbackGoal:
      "Share my everyday style and moments that make people feel good.",
    fallbackAudiences: [
      {
        who: "People who like casual style inspiration",
        outcome: "find outfit ideas",
      },
    ],
  },
];
