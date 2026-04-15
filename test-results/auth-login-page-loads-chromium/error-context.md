# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.spec.ts >> login page loads
- Location: tests/e2e/auth.spec.ts:5:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('input[type="email"]')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('input[type="email"]')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - navigation [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img "SpyReels" [ref=e8]
          - generic [ref=e9]: SpyReels
        - generic [ref=e10]:
          - link "Features" [ref=e11] [cursor=pointer]:
            - /url: "#features"
          - link "How It Works" [ref=e12] [cursor=pointer]:
            - /url: "#how-it-works"
          - link "Pricing" [ref=e13] [cursor=pointer]:
            - /url: "#pricing"
          - link "FAQ" [ref=e14] [cursor=pointer]:
            - /url: "#faq"
          - link "Blog" [ref=e15] [cursor=pointer]:
            - /url: /blog
        - generic [ref=e16]:
          - button "Log In" [ref=e17] [cursor=pointer]
          - button "Start Free" [ref=e18] [cursor=pointer]:
            - text: Start Free
            - img
    - generic [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - img
          - text: 12,000+ creators are already using SpyReels
        - heading "Why are their Reels getting 100K views and yours are getting 200?" [level=1] [ref=e23]
        - paragraph [ref=e24]: SpyReels shows you exactly which Reels are going viral in your niche, transcribes them word for word, and writes you a ready-to-film script based on the same formula. Most creators go from zero to filming in under 10 minutes.
        - paragraph [ref=e25]: While you are reading this, other creators in your niche are already using this.
        - generic [ref=e26]:
          - button "Start Free — No Credit Card" [ref=e27] [cursor=pointer]:
            - text: Start Free — No Credit Card
            - img
          - link "See how it works" [ref=e28] [cursor=pointer]:
            - /url: "#how-it-works"
            - text: See how it works
            - img [ref=e29]
        - paragraph [ref=e31]: Free plan includes 2 scrapes, 3 transcriptions, and 5 saved scripts per month
      - generic [ref=e32]:
        - generic [ref=e33]:
          - img [ref=e34]
          - generic [ref=e36]: 12,000+ creators
        - generic [ref=e37]:
          - img [ref=e38]
          - generic [ref=e40]: 2.4M+ Reels analyzed
        - generic [ref=e41]:
          - img [ref=e42]
          - generic [ref=e45]: 180,000+ scripts generated
        - generic [ref=e46]:
          - img [ref=e47]
          - generic [ref=e50]: Avg 9 min from research to script
      - img "SpyReels dashboard" [ref=e53]
    - generic [ref=e55]:
      - paragraph [ref=e56]: The difference between creators who grow and creators who don't
      - generic [ref=e57]:
        - generic [ref=e58]:
          - generic [ref=e59]:
            - img [ref=e60]
            - generic [ref=e63]: Without SpyReels
          - list [ref=e64]:
            - listitem [ref=e65]:
              - img [ref=e66]
              - text: Spend 3 hours scrolling for content ideas
            - listitem [ref=e69]:
              - img [ref=e70]
              - text: Post and hope the algorithm picks it up
            - listitem [ref=e73]:
              - img [ref=e74]
              - text: No idea why some Reels go viral and yours don't
            - listitem [ref=e77]:
              - img [ref=e78]
              - text: Manually transcribe videos to study the script
            - listitem [ref=e81]:
              - img [ref=e82]
              - text: Write scripts from scratch every single time
        - generic [ref=e85]:
          - generic [ref=e86]:
            - img [ref=e87]
            - generic [ref=e89]: With SpyReels
          - list [ref=e90]:
            - listitem [ref=e91]:
              - img [ref=e92]
              - text: See every viral Reel in your niche in 60 seconds
            - listitem [ref=e94]:
              - img [ref=e95]
              - text: Know exactly what works before you film anything
            - listitem [ref=e97]:
              - img [ref=e98]
              - text: Transcribe any Reel in one click, word for word
            - listitem [ref=e100]:
              - img [ref=e101]
              - text: Get a ready-to-film script in under 2 minutes
            - listitem [ref=e103]:
              - img [ref=e104]
              - text: Post with confidence knowing the formula works
    - generic [ref=e107]:
      - generic [ref=e108]:
        - generic [ref=e109]: What creators are saying
        - heading "Real creators. Real results." [level=2] [ref=e110]
        - paragraph [ref=e111]: Creators in every niche are using SpyReels to study what works and grow faster.
      - generic [ref=e112]:
        - generic [ref=e114]:
          - generic [ref=e115]:
            - img [ref=e116]
            - img [ref=e118]
            - img [ref=e120]
            - img [ref=e122]
            - img [ref=e124]
          - paragraph [ref=e126]: "\"I typed in a fitness creator with 2M followers and saw their top 10 Reels instantly. Transcribed the one with 800K views, got my script, filmed it the same day. That Reel got 34K views. My previous best was 1,200.\""
          - generic [ref=e127]:
            - generic [ref=e128]: MT
            - generic [ref=e129]:
              - paragraph [ref=e130]: Marcus T.
              - paragraph [ref=e131]: Fitness and nutrition creator · 14K followers
        - generic [ref=e133]:
          - generic [ref=e134]:
            - img [ref=e135]
            - img [ref=e137]
            - img [ref=e139]
            - img [ref=e141]
            - img [ref=e143]
          - paragraph [ref=e145]: "\"I spent months trying to figure out why my recipes never got traction. SpyReels showed me in 5 minutes that short punchy hooks with a surprise ending were getting all the views in my niche. Game changer.\""
          - generic [ref=e146]:
            - generic [ref=e147]: PS
            - generic [ref=e148]:
              - paragraph [ref=e149]: Priya S.
              - paragraph [ref=e150]: Food and recipe creator · 28K followers
        - generic [ref=e152]:
          - generic [ref=e153]:
            - img [ref=e154]
            - img [ref=e156]
            - img [ref=e158]
            - img [ref=e160]
            - img [ref=e162]
          - paragraph [ref=e164]: "\"As a real estate agent trying to grow on Instagram, I had no idea what content worked. SpyReels showed me every top performing Reel in my niche. I went from 400 views to 22K on my next video.\""
          - generic [ref=e165]:
            - generic [ref=e166]: DR
            - generic [ref=e167]:
              - paragraph [ref=e168]: Daniel R.
              - paragraph [ref=e169]: Real estate creator · 9K followers
        - generic [ref=e171]:
          - generic [ref=e172]:
            - img [ref=e173]
            - img [ref=e175]
            - img [ref=e177]
            - img [ref=e179]
            - img [ref=e181]
          - paragraph [ref=e183]: "\"I used to spend 4 hours every Sunday researching content ideas. Now I spend 15 minutes on SpyReels and have a full week of scripts ready to film. It is not even close.\""
          - generic [ref=e184]:
            - generic [ref=e185]: AM
            - generic [ref=e186]:
              - paragraph [ref=e187]: Aisha M.
              - paragraph [ref=e188]: Personal finance creator · 41K followers
        - generic [ref=e190]:
          - generic [ref=e191]:
            - img [ref=e192]
            - img [ref=e194]
            - img [ref=e196]
            - img [ref=e198]
            - img [ref=e200]
          - paragraph [ref=e202]: "\"Every big creator I looked up to was clearly using some kind of system. SpyReels is that system. I finally understand what makes content go viral and I can replicate it every single week.\""
          - generic [ref=e203]:
            - generic [ref=e204]: JK
            - generic [ref=e205]:
              - paragraph [ref=e206]: Jordan K.
              - paragraph [ref=e207]: Lifestyle and mindset creator · 19K followers
        - generic [ref=e209]:
          - generic [ref=e210]:
            - img [ref=e211]
            - img [ref=e213]
            - img [ref=e215]
            - img [ref=e217]
            - img [ref=e219]
          - paragraph [ref=e221]: "\"I found 3 viral Reels in my niche, transcribed them all in under 10 minutes, and had scripts for my entire week done before lunch. I have not missed a posting day since I started using SpyReels.\""
          - generic [ref=e222]:
            - generic [ref=e223]: LB
            - generic [ref=e224]:
              - paragraph [ref=e225]: Lauren B.
              - paragraph [ref=e226]: Beauty and skincare creator · 33K followers
    - generic [ref=e228]:
      - generic [ref=e229]:
        - generic [ref=e230]: Everything you need to go viral
        - heading "Stop guessing. Start knowing." [level=2] [ref=e231]
        - paragraph [ref=e232]: "Every feature is built around one goal: getting you from zero ideas to ready-to-film script as fast as possible."
      - generic [ref=e233]:
        - generic [ref=e235]:
          - img [ref=e237]
          - heading "See every Reel your competitor has ever posted" [level=3] [ref=e239]
          - paragraph [ref=e240]: Enter any public Instagram handle and see every Reel ranked by views, likes, engagement rate and comments. Know what is working for them before you film anything.
        - generic [ref=e242]:
          - img [ref=e244]
          - heading "Find viral Reels in your niche in seconds" [level=3] [ref=e247]
          - paragraph [ref=e248]: Search by keyword or paste any Reel URL. Filter by engagement rate, view count, or date. Stop scrolling for hours. Find what is working in your niche in under 60 seconds.
        - generic [ref=e250]:
          - img [ref=e252]
          - heading "Know word for word what top creators are saying" [level=3] [ref=e255]
          - paragraph [ref=e256]: One click transcription with timestamped segments. See the exact hook, the exact words, the exact structure that made a Reel hit 500K views. No more guessing.
        - generic [ref=e258]:
          - img [ref=e260]
          - heading "Get a ready-to-film script in under 2 minutes" [level=3] [ref=e263]
          - paragraph [ref=e264]: AI reverse-engineers the viral formula and rewrites it in your voice for your niche. You get a complete script with delivery cues, hook, body, and CTA. Ready to film.
        - generic [ref=e266]:
          - img [ref=e268]
          - heading "Never lose a good idea again" [level=3] [ref=e271]
          - paragraph [ref=e272]: Save scripts, organize by status, schedule on a calendar. From idea to posted Reel, everything lives in one place. No more notes apps, no more lost drafts.
        - link "Sort any creator's feed by engagement on Instagram The SpyReels Chrome extension lets you sort any creator's feed by engagement rate, save Reels, and transcribe without leaving Instagram. Learn more" [ref=e273] [cursor=pointer]:
          - /url: /extension
          - generic [ref=e275]:
            - img [ref=e277]
            - heading "Sort any creator's feed by engagement on Instagram" [level=3] [ref=e282]
            - paragraph [ref=e283]: The SpyReels Chrome extension lets you sort any creator's feed by engagement rate, save Reels, and transcribe without leaving Instagram.
            - generic [ref=e284]:
              - text: Learn more
              - img [ref=e285]
    - generic [ref=e288]:
      - generic [ref=e289]:
        - generic [ref=e290]: Simple 3-step workflow
        - heading "From zero ideas to ready-to-film in 10 minutes" [level=2] [ref=e291]
        - paragraph [ref=e292]: No more hours scrolling for inspiration. This is the workflow top creators wish they had when they started.
      - generic [ref=e293]:
        - generic [ref=e296]:
          - generic [ref=e297]:
            - img [ref=e299]
            - generic [ref=e302]: "01"
          - heading "Pick a creator winning in your niche" [level=3] [ref=e303]
          - paragraph [ref=e304]: Enter their Instagram handle. SpyReels pulls every Reel they have posted, sorted by what is actually performing. You see their top 10 viral Reels in seconds.
        - generic [ref=e307]:
          - generic [ref=e308]:
            - img [ref=e310]
            - generic [ref=e312]: "02"
          - heading "Transcribe the one that blew up" [level=3] [ref=e313]
          - paragraph [ref=e314]: One click. You get the full transcript with timestamps, the hook word for word, the structure, the CTA. You now know exactly why it went viral.
        - generic [ref=e316]:
          - generic [ref=e317]:
            - img [ref=e319]
            - generic [ref=e321]: "03"
          - heading "Get your script and film it today" [level=3] [ref=e322]
          - paragraph [ref=e323]: AI takes their viral formula and writes your version. Your niche, your voice, your angle. Teleprompter included. Most creators film within an hour of getting the script.
      - generic [ref=e324]:
        - img "SpyReels workflow"
    - generic [ref=e330]:
      - generic [ref=e331]: The truth about going viral
      - heading "The creators winning on Instagram are not more talented than you." [level=2] [ref=e332]
      - generic [ref=e333]:
        - paragraph [ref=e334]: They just know what works before they hit record. They study what is already going viral in their niche, they understand why it worked, and they create their version. That is the entire strategy.
        - paragraph [ref=e335]: SpyReels gives you that exact intelligence in minutes. See what is going viral, transcribe it, understand the formula, get a script. The creators doing this consistently are the ones growing consistently.
        - paragraph [ref=e336]: The ones not doing it are posting into the void and wondering why nothing works.
      - generic [ref=e337]:
        - button "Start for Free" [ref=e338] [cursor=pointer]:
          - text: Start for Free
          - img
        - generic [ref=e339]:
          - img [ref=e340]
          - generic [ref=e342]: 14-day money-back guarantee on all paid plans
    - generic [ref=e344]:
      - generic [ref=e345]:
        - generic [ref=e346]: Simple, transparent pricing
        - heading "Start free. Upgrade when you're ready." [level=2] [ref=e347]
        - paragraph [ref=e348]: No tricks, no hidden fees. The free plan is genuinely useful.
        - generic [ref=e349]:
          - generic [ref=e350]: Monthly
          - button [ref=e351] [cursor=pointer]
          - generic [ref=e353]: Annual
          - generic [ref=e354]: Save 40%+
      - generic [ref=e355]:
        - generic [ref=e357]:
          - generic [ref=e358]:
            - img [ref=e359]
            - heading "Free" [level=3] [ref=e361]
          - generic [ref=e362]: $0
          - paragraph [ref=e363]: forever
          - paragraph [ref=e364]: Try everything. No credit card.
          - button "Start Free" [ref=e365] [cursor=pointer]
          - list [ref=e366]:
            - listitem [ref=e367]:
              - img [ref=e368]
              - generic [ref=e370]: 2 handle scrapes/month
            - listitem [ref=e371]:
              - img [ref=e372]
              - generic [ref=e374]: 3 transcriptions/month
            - listitem [ref=e375]:
              - img [ref=e376]
              - generic [ref=e378]: 5 saved scripts
            - listitem [ref=e379]:
              - img [ref=e380]
              - generic [ref=e382]: Chrome extension basics
        - generic [ref=e384]:
          - generic [ref=e385]:
            - img [ref=e386]
            - heading "Starter" [level=3] [ref=e391]
          - generic [ref=e392]: $11/mo
          - paragraph [ref=e393]:
            - generic [ref=e394]: $19/mo
            - text: billed annually
          - paragraph [ref=e395]: For creators getting serious.
          - button "Get Started" [ref=e396] [cursor=pointer]
          - list [ref=e397]:
            - listitem [ref=e398]:
              - img [ref=e399]
              - generic [ref=e401]: 10 scrapes/month
            - listitem [ref=e402]:
              - img [ref=e403]
              - generic [ref=e405]: 30 transcriptions/month
            - listitem [ref=e406]:
              - img [ref=e407]
              - generic [ref=e409]: 15 AI re-creations
            - listitem [ref=e410]:
              - img [ref=e411]
              - generic [ref=e413]: CSV & Google Sheets export
        - generic [ref=e414]:
          - generic [ref=e416]: Most Popular
          - generic [ref=e417]:
            - generic [ref=e418]:
              - img [ref=e419]
              - heading "Pro" [level=3] [ref=e421]
            - generic [ref=e422]: $29/mo
            - paragraph [ref=e423]:
              - generic [ref=e424]: $49/mo
              - text: billed annually
            - paragraph [ref=e425]: The full content machine.
            - button "Get Started" [ref=e426] [cursor=pointer]
            - list [ref=e427]:
              - listitem [ref=e428]:
                - img [ref=e429]
                - generic [ref=e431]: 50 scrapes/month
              - listitem [ref=e432]:
                - img [ref=e433]
                - generic [ref=e435]: 200 transcriptions/month
              - listitem [ref=e436]:
                - img [ref=e437]
                - generic [ref=e439]: 100 AI re-creations
              - listitem [ref=e440]:
                - img [ref=e441]
                - generic [ref=e443]: Voice teleprompter & smart takes
        - generic [ref=e445]:
          - generic [ref=e446]:
            - img [ref=e447]
            - heading "Business" [level=3] [ref=e451]
          - generic [ref=e452]: $59/mo
          - paragraph [ref=e453]:
            - generic [ref=e454]: $99/mo
            - text: billed annually
          - paragraph [ref=e455]: For teams and agencies.
          - button "Get Started" [ref=e456] [cursor=pointer]
          - list [ref=e457]:
            - listitem [ref=e458]:
              - img [ref=e459]
              - generic [ref=e461]: 200 scrapes/month
            - listitem [ref=e462]:
              - img [ref=e463]
              - generic [ref=e465]: 1,000 transcriptions/month
            - listitem [ref=e466]:
              - img [ref=e467]
              - generic [ref=e469]: 500 AI re-creations
            - listitem [ref=e470]:
              - img [ref=e471]
              - generic [ref=e473]: 10 team members + API access
    - generic [ref=e476]:
      - generic [ref=e477]:
        - img [ref=e478]
        - paragraph [ref=e480]: 14-day money-back guarantee
      - generic [ref=e481]:
        - img [ref=e482]
        - paragraph [ref=e485]: Cancel anytime, no contracts
      - generic [ref=e486]:
        - img [ref=e487]
        - paragraph [ref=e489]: Free plan, no credit card
      - generic [ref=e490]:
        - img [ref=e491]
        - paragraph [ref=e494]: Export all your data anytime
    - generic [ref=e496]:
      - heading "Questions? We have answers." [level=2] [ref=e498]
      - generic [ref=e499]:
        - button "How is this different from just manually scrolling Instagram?" [ref=e501] [cursor=pointer]:
          - generic [ref=e502]: How is this different from just manually scrolling Instagram?
          - img [ref=e503]
        - button "Will Instagram ban my account for using this?" [ref=e506] [cursor=pointer]:
          - generic [ref=e507]: Will Instagram ban my account for using this?
          - img [ref=e508]
        - button "How fast can I actually get a script?" [ref=e511] [cursor=pointer]:
          - generic [ref=e512]: How fast can I actually get a script?
          - img [ref=e513]
        - button "Do I need to be a big creator for this to work?" [ref=e516] [cursor=pointer]:
          - generic [ref=e517]: Do I need to be a big creator for this to work?
          - img [ref=e518]
        - button "What if I don't like it after paying?" [ref=e521] [cursor=pointer]:
          - generic [ref=e522]: What if I don't like it after paying?
          - img [ref=e523]
        - button "Can I save money with annual billing?" [ref=e526] [cursor=pointer]:
          - generic [ref=e527]: Can I save money with annual billing?
          - img [ref=e528]
    - generic [ref=e534]:
      - heading "Your competitors are already using this." [level=2] [ref=e535]
      - paragraph [ref=e536]: Every day you wait is another day they study what works and you guess. Start free in 30 seconds.
      - button "Start Free Now" [ref=e537] [cursor=pointer]:
        - text: Start Free Now
        - img
      - paragraph [ref=e538]: No credit card required. Free plan available forever.
    - contentinfo [ref=e539]:
      - generic [ref=e541]:
        - generic [ref=e542]:
          - img "SpyReels" [ref=e543]
          - generic [ref=e544]: SpyReels
        - generic [ref=e545]:
          - link "Features" [ref=e546] [cursor=pointer]:
            - /url: "#features"
          - link "Pricing" [ref=e547] [cursor=pointer]:
            - /url: "#pricing"
          - link "FAQ" [ref=e548] [cursor=pointer]:
            - /url: "#faq"
          - link "Blog" [ref=e549] [cursor=pointer]:
            - /url: /blog
          - link "Chrome Extension" [ref=e550] [cursor=pointer]:
            - /url: /extension
          - link "Terms" [ref=e551] [cursor=pointer]:
            - /url: /terms
          - link "Privacy" [ref=e552] [cursor=pointer]:
            - /url: /privacy
        - paragraph [ref=e553]: © 2026 SpyReels. All rights reserved.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import * as dotenv from 'dotenv';
  3  | dotenv.config({ path: 'tests/e2e/.env.test' });
  4  | 
  5  | test('login page loads', async ({ page }) => {
  6  |   await page.goto('/login');
> 7  |   await expect(page.locator('input[type="email"]')).toBeVisible();
     |                                                     ^ Error: expect(locator).toBeVisible() failed
  8  |   await expect(page.locator('input[type="password"]')).toBeVisible();
  9  | });
  10 | 
  11 | test('login with valid credentials', async ({ page }) => {
  12 |   await page.goto('/login');
  13 |   await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  14 |   await page.fill('input[type="password"]', process.env.TEST_PASSWORD!);
  15 |   await page.click('button[type="submit"]');
  16 |   await expect(page).toHaveURL(/dashboard/, { timeout: 10000 });
  17 | });
  18 | 
  19 | test('login fails with wrong password', async ({ page }) => {
  20 |   await page.goto('/login');
  21 |   await page.fill('input[type="email"]', process.env.TEST_EMAIL!);
  22 |   await page.fill('input[type="password"]', 'wrongpassword');
  23 |   await page.click('button[type="submit"]');
  24 |   await expect(page).not.toHaveURL(/dashboard/);
  25 | });
  26 | 
```