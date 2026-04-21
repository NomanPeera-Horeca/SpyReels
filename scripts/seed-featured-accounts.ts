/**
 * Seeds featured_accounts and featured_account_niches with curated famous accounts.
 * 5 accounts per niche × 30 niches. Some accounts span multiple niches (junction table).
 *
 * Run with: tsx scripts/seed-featured-accounts.ts
 * Requires DATABASE_URL env var.
 * Idempotent - safe to re-run.
 */

import mysql from "mysql2/promise";

interface AccountSeed {
  handle: string;
  displayName: string;
  niches: { slug: string; isPrimary: boolean }[];
}

const ACCOUNTS: AccountSeed[] = [
  // BUSINESS & MONEY GROUP

  // 1. Marketing & Sales
  { handle: "garyvee", displayName: "Gary Vaynerchuk", niches: [
    { slug: "marketing-sales", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
    { slug: "content-marketing", isPrimary: false },
  ]},
  { handle: "neilpatel", displayName: "Neil Patel", niches: [
    { slug: "marketing-sales", isPrimary: true },
    { slug: "content-marketing", isPrimary: false },
  ]},
  { handle: "russellbrunson", displayName: "Russell Brunson", niches: [
    { slug: "marketing-sales", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},
  { handle: "danielfazio", displayName: "Daniel Fazio", niches: [
    { slug: "marketing-sales", isPrimary: true },
    { slug: "make-money-online", isPrimary: false },
  ]},
  { handle: "sahilbloom", displayName: "Sahil Bloom", niches: [
    { slug: "marketing-sales", isPrimary: true },
    { slug: "personal-finance", isPrimary: false },
  ]},

  // 2. Business & Entrepreneurship
  { handle: "alexhormozi", displayName: "Alex Hormozi", niches: [
    { slug: "business-entrepreneurship", isPrimary: true },
    { slug: "marketing-sales", isPrimary: false },
    { slug: "make-money-online", isPrimary: false },
  ]},
  { handle: "codiesanchez", displayName: "Codie Sanchez", niches: [
    { slug: "business-entrepreneurship", isPrimary: true },
    { slug: "investing-crypto", isPrimary: false },
  ]},
  { handle: "naval", displayName: "Naval Ravikant", niches: [
    { slug: "business-entrepreneurship", isPrimary: true },
  ]},
  { handle: "imangadzhi", displayName: "Iman Gadzhi", niches: [
    { slug: "business-entrepreneurship", isPrimary: true },
    { slug: "make-money-online", isPrimary: false },
  ]},
  { handle: "danmartell", displayName: "Dan Martell", niches: [
    { slug: "business-entrepreneurship", isPrimary: true },
    { slug: "marketing-sales", isPrimary: false },
  ]},

  // 3. Personal Finance
  { handle: "humphreytalks", displayName: "Humphrey Yang", niches: [
    { slug: "personal-finance", isPrimary: true },
    { slug: "investing-crypto", isPrimary: false },
  ]},
  { handle: "vivian_tu", displayName: "Vivian Tu (Your Rich BFF)", niches: [
    { slug: "personal-finance", isPrimary: true },
    { slug: "investing-crypto", isPrimary: false },
  ]},
  { handle: "erikafinance", displayName: "Erika Kullberg", niches: [
    { slug: "personal-finance", isPrimary: true },
  ]},
  { handle: "thebudgetnista", displayName: "Tiffany Aliche", niches: [
    { slug: "personal-finance", isPrimary: true },
  ]},
  { handle: "tarazirker", displayName: "Tara Zirker", niches: [
    { slug: "personal-finance", isPrimary: true },
    { slug: "marketing-sales", isPrimary: false },
  ]},

  // 4. Investing & Crypto
  { handle: "graham", displayName: "Graham Stephan", niches: [
    { slug: "investing-crypto", isPrimary: true },
    { slug: "personal-finance", isPrimary: false },
    { slug: "real-estate", isPrimary: false },
  ]},
  { handle: "meetkevin", displayName: "Kevin Paffrath", niches: [
    { slug: "investing-crypto", isPrimary: true },
    { slug: "real-estate", isPrimary: false },
  ]},
  { handle: "andreijikh", displayName: "Andrei Jikh", niches: [
    { slug: "investing-crypto", isPrimary: true },
  ]},
  { handle: "coin_bureau", displayName: "Coin Bureau", niches: [
    { slug: "investing-crypto", isPrimary: true },
  ]},
  { handle: "anthonypompliano", displayName: "Anthony Pompliano", niches: [
    { slug: "investing-crypto", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},

  // 5. Real Estate
  { handle: "grantcardone", displayName: "Grant Cardone", niches: [
    { slug: "real-estate", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},
  { handle: "ryanserhant", displayName: "Ryan Serhant", niches: [
    { slug: "real-estate", isPrimary: true },
  ]},
  { handle: "ryanpineda", displayName: "Ryan Pineda", niches: [
    { slug: "real-estate", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},
  { handle: "biggerpockets", displayName: "BiggerPockets", niches: [
    { slug: "real-estate", isPrimary: true },
    { slug: "investing-crypto", isPrimary: false },
  ]},
  { handle: "the.broke.agent", displayName: "The Broke Agent", niches: [
    { slug: "real-estate", isPrimary: true },
    { slug: "comedy-memes", isPrimary: false },
  ]},

  // 6. E-commerce & DTC
  { handle: "nickshackelford", displayName: "Nick Shackelford", niches: [
    { slug: "ecommerce-dtc", isPrimary: true },
    { slug: "marketing-sales", isPrimary: false },
  ]},
  { handle: "ezracfirestone", displayName: "Ezra Firestone", niches: [
    { slug: "ecommerce-dtc", isPrimary: true },
  ]},
  { handle: "davidherrmann", displayName: "David Herrmann", niches: [
    { slug: "ecommerce-dtc", isPrimary: true },
  ]},
  { handle: "shopify", displayName: "Shopify", niches: [
    { slug: "ecommerce-dtc", isPrimary: true },
  ]},
  { handle: "moizali", displayName: "Moiz Ali", niches: [
    { slug: "ecommerce-dtc", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},

  // 7. Career & Jobs
  { handle: "erinmcgoff", displayName: "Erin McGoff", niches: [
    { slug: "career-jobs", isPrimary: true },
    { slug: "tutorials-how-to", isPrimary: false },
  ]},
  { handle: "jerryjhlee", displayName: "Jerry Lee", niches: [
    { slug: "career-jobs", isPrimary: true },
  ]},
  { handle: "austinbelcak", displayName: "Austin Belcak", niches: [
    { slug: "career-jobs", isPrimary: true },
  ]},
  { handle: "thatworkinggirl", displayName: "Lara Acosta", niches: [
    { slug: "career-jobs", isPrimary: true },
    { slug: "content-marketing", isPrimary: false },
  ]},
  { handle: "kyyahabdul", displayName: "Kyyah Abdul", niches: [
    { slug: "career-jobs", isPrimary: true },
  ]},

  // 8. Make Money Online
  { handle: "aliabdaal", displayName: "Ali Abdaal", niches: [
    { slug: "make-money-online", isPrimary: true },
    { slug: "tutorials-how-to", isPrimary: false },
    { slug: "education-teaching", isPrimary: false },
  ]},
  { handle: "jasonwojo", displayName: "Jason Wojo", niches: [
    { slug: "make-money-online", isPrimary: true },
    { slug: "marketing-sales", isPrimary: false },
  ]},
  { handle: "iam.alexb", displayName: "Alex Berman", niches: [
    { slug: "make-money-online", isPrimary: true },
  ]},
  { handle: "thedankoe", displayName: "Dan Koe", niches: [
    { slug: "make-money-online", isPrimary: true },
    { slug: "content-marketing", isPrimary: false },
    { slug: "marketing-sales", isPrimary: false },
  ]},
  { handle: "matt_gray_", displayName: "Matt Gray", niches: [
    { slug: "make-money-online", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},

  // CREATOR ECONOMY GROUP

  // 9. AI & Tech Creators
  { handle: "minchoi", displayName: "Min Choi", niches: [
    { slug: "ai-tech-creators", isPrimary: true },
  ]},
  { handle: "riley.brown.ai", displayName: "Riley Brown", niches: [
    { slug: "ai-tech-creators", isPrimary: true },
  ]},
  { handle: "heyitsalexa", displayName: "Alexa - AI Content", niches: [
    { slug: "ai-tech-creators", isPrimary: true },
    { slug: "faceless-content", isPrimary: false },
  ]},
  { handle: "ai.outpost", displayName: "AI Outpost", niches: [
    { slug: "ai-tech-creators", isPrimary: true },
  ]},
  { handle: "therealbrianmark", displayName: "Brian Mark", niches: [
    { slug: "ai-tech-creators", isPrimary: true },
    { slug: "content-marketing", isPrimary: false },
  ]},

  // 10. Content Marketing
  { handle: "jenny.hoyos", displayName: "Jenny Hoyos", niches: [
    { slug: "content-marketing", isPrimary: true },
  ]},
  { handle: "chrisdo", displayName: "Chris Do", niches: [
    { slug: "content-marketing", isPrimary: true },
    { slug: "business-entrepreneurship", isPrimary: false },
  ]},
  { handle: "alexcattoni", displayName: "Alex Cattoni", niches: [
    { slug: "content-marketing", isPrimary: true },
    { slug: "marketing-sales", isPrimary: false },
  ]},
  { handle: "vanessalau.co", displayName: "Vanessa Lau", niches: [
    { slug: "content-marketing", isPrimary: true },
  ]},
  { handle: "modernmillie", displayName: "Modern Millie", niches: [
    { slug: "content-marketing", isPrimary: true },
  ]},

  // 11. Faceless Content
  { handle: "dailystoic", displayName: "Daily Stoic", niches: [
    { slug: "faceless-content", isPrimary: true },
    { slug: "spirituality-astrology", isPrimary: false },
  ]},
  { handle: "facelessincome", displayName: "Faceless Income", niches: [
    { slug: "faceless-content", isPrimary: true },
    { slug: "make-money-online", isPrimary: false },
  ]},
  { handle: "iamthatishop", displayName: "I Am That I Shop", niches: [
    { slug: "faceless-content", isPrimary: true },
    { slug: "spirituality-astrology", isPrimary: false },
  ]},
  { handle: "the_motivation_chronicles", displayName: "Motivation Chronicles", niches: [
    { slug: "faceless-content", isPrimary: true },
  ]},
  { handle: "highvaluemindset.0", displayName: "High Value Mindset", niches: [
    { slug: "faceless-content", isPrimary: true },
    { slug: "mental-health-mindfulness", isPrimary: false },
  ]},

  // 12. Photography & Videography
  { handle: "peterlindgren", displayName: "Peter Lindgren", niches: [
    { slug: "photography-videography", isPrimary: true },
  ]},
  { handle: "jordi.koalitic", displayName: "Jordi Koalitic", niches: [
    { slug: "photography-videography", isPrimary: true },
  ]},
  { handle: "mattkomo", displayName: "Matti Haapoja", niches: [
    { slug: "photography-videography", isPrimary: true },
  ]},
  { handle: "dylan_hartigan", displayName: "Dylan Hartigan", niches: [
    { slug: "photography-videography", isPrimary: true },
  ]},
  { handle: "danielschiffer", displayName: "Daniel Schiffer", niches: [
    { slug: "photography-videography", isPrimary: true },
  ]},

  // 13. Tutorials & How-To
  { handle: "thomasfrank", displayName: "Thomas Frank", niches: [
    { slug: "tutorials-how-to", isPrimary: true },
    { slug: "education-teaching", isPrimary: false },
  ]},
  { handle: "fivedayfilm", displayName: "Five Day Film", niches: [
    { slug: "tutorials-how-to", isPrimary: true },
    { slug: "photography-videography", isPrimary: false },
  ]},
  { handle: "smarterthanmemes", displayName: "Smarter Than Memes", niches: [
    { slug: "tutorials-how-to", isPrimary: true },
  ]},
  { handle: "lifehacker", displayName: "Lifehacker", niches: [
    { slug: "tutorials-how-to", isPrimary: true },
  ]},
  { handle: "futureproofai", displayName: "Future Proof AI", niches: [
    { slug: "tutorials-how-to", isPrimary: true },
    { slug: "ai-tech-creators", isPrimary: false },
  ]},

  // LIFESTYLE GROUP

  // 14. Fashion & Style
  { handle: "camilacoelho", displayName: "Camila Coelho", niches: [
    { slug: "fashion-style", isPrimary: true },
  ]},
  { handle: "chiaraferragni", displayName: "Chiara Ferragni", niches: [
    { slug: "fashion-style", isPrimary: true },
  ]},
  { handle: "aimeesong", displayName: "Aimee Song", niches: [
    { slug: "fashion-style", isPrimary: true },
  ]},
  { handle: "wendynguyen", displayName: "Wendy Nguyen", niches: [
    { slug: "fashion-style", isPrimary: true },
  ]},
  { handle: "brittanyxavier", displayName: "Brittany Xavier", niches: [
    { slug: "fashion-style", isPrimary: true },
  ]},

  // 15. Beauty & Skincare
  { handle: "hudabeauty", displayName: "Huda Kattan", niches: [
    { slug: "beauty-skincare", isPrimary: true },
  ]},
  { handle: "jamescharles", displayName: "James Charles", niches: [
    { slug: "beauty-skincare", isPrimary: true },
  ]},
  { handle: "nikkietutorials", displayName: "Nikkie de Jager", niches: [
    { slug: "beauty-skincare", isPrimary: true },
  ]},
  { handle: "patrickta", displayName: "Patrick Ta", niches: [
    { slug: "beauty-skincare", isPrimary: true },
  ]},
  { handle: "mikaylanogueira", displayName: "Mikayla Nogueira", niches: [
    { slug: "beauty-skincare", isPrimary: true },
  ]},

  // 16. Health & Fitness
  { handle: "kayla_itsines", displayName: "Kayla Itsines", niches: [
    { slug: "health-fitness", isPrimary: true },
  ]},
  { handle: "chrisbumstead", displayName: "Chris Bumstead", niches: [
    { slug: "health-fitness", isPrimary: true },
  ]},
  { handle: "joeyswoll", displayName: "Joey Swoll", niches: [
    { slug: "health-fitness", isPrimary: true },
  ]},
  { handle: "whitneysimmons", displayName: "Whitney Simmons", niches: [
    { slug: "health-fitness", isPrimary: true },
  ]},
  { handle: "thefitnesschef_", displayName: "The Fitness Chef", niches: [
    { slug: "health-fitness", isPrimary: true },
  ]},

  // 17. Mental Health & Mindfulness
  { handle: "jayshetty", displayName: "Jay Shetty", niches: [
    { slug: "mental-health-mindfulness", isPrimary: true },
    { slug: "spirituality-astrology", isPrimary: false },
  ]},
  { handle: "the.holistic.psychologist", displayName: "Dr. Nicole LePera", niches: [
    { slug: "mental-health-mindfulness", isPrimary: true },
  ]},
  { handle: "lisaolivera", displayName: "Lisa Olivera", niches: [
    { slug: "mental-health-mindfulness", isPrimary: true },
  ]},
  { handle: "iampositiveenergy", displayName: "Maryam Hasnaa", niches: [
    { slug: "mental-health-mindfulness", isPrimary: true },
    { slug: "spirituality-astrology", isPrimary: false },
  ]},
  { handle: "yung_pueblo", displayName: "Yung Pueblo", niches: [
    { slug: "mental-health-mindfulness", isPrimary: true },
  ]},

  // 18. Food & Cooking
  { handle: "gordongram", displayName: "Gordon Ramsay", niches: [
    { slug: "food-cooking", isPrimary: true },
    { slug: "restaurants-cafes", isPrimary: false },
  ]},
  { handle: "joshuaweissman", displayName: "Joshua Weissman", niches: [
    { slug: "food-cooking", isPrimary: true },
  ]},
  { handle: "thatdudecancook", displayName: "Sonny Hurrell", niches: [
    { slug: "food-cooking", isPrimary: true },
  ]},
  { handle: "maxiglaser", displayName: "Max Glaser", niches: [
    { slug: "food-cooking", isPrimary: true },
  ]},
  { handle: "halfbakedharvest", displayName: "Tieghan Gerard", niches: [
    { slug: "food-cooking", isPrimary: true },
  ]},

  // 19. Restaurants & Cafes
  { handle: "saltbae", displayName: "Nusret (Salt Bae)", niches: [
    { slug: "restaurants-cafes", isPrimary: true },
    { slug: "food-cooking", isPrimary: false },
  ]},
  { handle: "infatuation", displayName: "The Infatuation", niches: [
    { slug: "restaurants-cafes", isPrimary: true },
  ]},
  { handle: "newforkcity", displayName: "New Fork City", niches: [
    { slug: "restaurants-cafes", isPrimary: true },
    { slug: "food-cooking", isPrimary: false },
  ]},
  { handle: "eater", displayName: "Eater", niches: [
    { slug: "restaurants-cafes", isPrimary: true },
  ]},
  { handle: "foodbeast", displayName: "Foodbeast", niches: [
    { slug: "restaurants-cafes", isPrimary: true },
    { slug: "food-cooking", isPrimary: false },
  ]},

  // 20. Travel
  { handle: "saltinourhair", displayName: "Salt In Our Hair", niches: [
    { slug: "travel", isPrimary: true },
  ]},
  { handle: "chrisburkard", displayName: "Chris Burkard", niches: [
    { slug: "travel", isPrimary: true },
    { slug: "photography-videography", isPrimary: false },
  ]},
  { handle: "doyoutravel", displayName: "Jack Morris", niches: [
    { slug: "travel", isPrimary: true },
  ]},
  { handle: "gypsea_lust", displayName: "Lauren Bullen", niches: [
    { slug: "travel", isPrimary: true },
  ]},
  { handle: "muradosmann", displayName: "Murad Osmann", niches: [
    { slug: "travel", isPrimary: true },
  ]},

  // 21. Home & Interior Design
  { handle: "studio.mcgee", displayName: "Studio McGee", niches: [
    { slug: "home-interior-design", isPrimary: true },
  ]},
  { handle: "joannagaines", displayName: "Joanna Gaines", niches: [
    { slug: "home-interior-design", isPrimary: true },
  ]},
  { handle: "athenacalderone", displayName: "Athena Calderone", niches: [
    { slug: "home-interior-design", isPrimary: true },
  ]},
  { handle: "amberinteriors", displayName: "Amber Lewis", niches: [
    { slug: "home-interior-design", isPrimary: true },
  ]},
  { handle: "mrkate", displayName: "Mr Kate", niches: [
    { slug: "home-interior-design", isPrimary: true },
  ]},

  // PERSONAL & FAMILY GROUP

  // 22. Parenting & Family
  { handle: "biglittlefeelings", displayName: "Big Little Feelings", niches: [
    { slug: "parenting-family", isPrimary: true },
  ]},
  { handle: "mrchazz", displayName: "Chazz Lewis", niches: [
    { slug: "parenting-family", isPrimary: true },
    { slug: "education-teaching", isPrimary: false },
  ]},
  { handle: "thefatherhoodlife", displayName: "Patrick Quinn", niches: [
    { slug: "parenting-family", isPrimary: true },
  ]},
  { handle: "busytoddler", displayName: "Susie Allison", niches: [
    { slug: "parenting-family", isPrimary: true },
  ]},
  { handle: "raisinggoodhumanspodcast", displayName: "Raising Good Humans", niches: [
    { slug: "parenting-family", isPrimary: true },
  ]},

  // 23. Dating & Relationships
  { handle: "mathewboggs", displayName: "Mat Boggs", niches: [
    { slug: "dating-relationships", isPrimary: true },
  ]},
  { handle: "jillianturecki", displayName: "Jillian Turecki", niches: [
    { slug: "dating-relationships", isPrimary: true },
  ]},
  { handle: "marisapeer", displayName: "Marisa Peer", niches: [
    { slug: "dating-relationships", isPrimary: true },
    { slug: "mental-health-mindfulness", isPrimary: false },
  ]},
  { handle: "stephaniecatahan", displayName: "Stephanie Catahan", niches: [
    { slug: "dating-relationships", isPrimary: true },
  ]},
  { handle: "thelovetheorist", displayName: "The Love Theorist", niches: [
    { slug: "dating-relationships", isPrimary: true },
  ]},

  // 24. Pets & Animals
  { handle: "jiffpom", displayName: "Jiff Pom", niches: [
    { slug: "pets-animals", isPrimary: true },
  ]},
  { handle: "doug_the_pug", displayName: "Doug the Pug", niches: [
    { slug: "pets-animals", isPrimary: true },
  ]},
  { handle: "nala_cat", displayName: "Nala Cat", niches: [
    { slug: "pets-animals", isPrimary: true },
  ]},
  { handle: "juniperfoxx", displayName: "Juniper Foxx", niches: [
    { slug: "pets-animals", isPrimary: true },
  ]},
  { handle: "theellenshow", displayName: "Tucker Budzyn", niches: [
    { slug: "pets-animals", isPrimary: true },
  ]},

  // 25. Education & Teaching
  { handle: "tedtalksdaily", displayName: "TED Talks", niches: [
    { slug: "education-teaching", isPrimary: true },
  ]},
  { handle: "khanacademy", displayName: "Khan Academy", niches: [
    { slug: "education-teaching", isPrimary: true },
  ]},
  { handle: "scishow", displayName: "SciShow", niches: [
    { slug: "education-teaching", isPrimary: true },
  ]},
  { handle: "thekidshouldseethis", displayName: "The Kid Should See This", niches: [
    { slug: "education-teaching", isPrimary: true },
  ]},
  { handle: "iamprofessorl", displayName: "Professor L", niches: [
    { slug: "education-teaching", isPrimary: true },
  ]},

  // ENTERTAINMENT & CULTURE GROUP

  // 26. Comedy & Memes
  { handle: "kingbach", displayName: "King Bach", niches: [
    { slug: "comedy-memes", isPrimary: true },
  ]},
  { handle: "thefatjewish", displayName: "The Fat Jewish", niches: [
    { slug: "comedy-memes", isPrimary: true },
  ]},
  { handle: "daquan", displayName: "Daquan", niches: [
    { slug: "comedy-memes", isPrimary: true },
  ]},
  { handle: "f__ckjerry", displayName: "Fuck Jerry", niches: [
    { slug: "comedy-memes", isPrimary: true },
  ]},
  { handle: "betches", displayName: "Betches", niches: [
    { slug: "comedy-memes", isPrimary: true },
  ]},

  // 27. Music & Musicians
  { handle: "billieeilish", displayName: "Billie Eilish", niches: [
    { slug: "music-musicians", isPrimary: true },
  ]},
  { handle: "edsheeran", displayName: "Ed Sheeran", niches: [
    { slug: "music-musicians", isPrimary: true },
  ]},
  { handle: "musicianhub", displayName: "Musician Hub", niches: [
    { slug: "music-musicians", isPrimary: true },
  ]},
  { handle: "produceaholic", displayName: "Produce Aholic", niches: [
    { slug: "music-musicians", isPrimary: true },
  ]},
  { handle: "splice", displayName: "Splice", niches: [
    { slug: "music-musicians", isPrimary: true },
  ]},

  // 28. Sports & Athletes
  { handle: "cristiano", displayName: "Cristiano Ronaldo", niches: [
    { slug: "sports-athletes", isPrimary: true },
  ]},
  { handle: "leomessi", displayName: "Lionel Messi", niches: [
    { slug: "sports-athletes", isPrimary: true },
  ]},
  { handle: "shaq", displayName: "Shaquille O'Neal", niches: [
    { slug: "sports-athletes", isPrimary: true },
  ]},
  { handle: "espn", displayName: "ESPN", niches: [
    { slug: "sports-athletes", isPrimary: true },
  ]},
  { handle: "houseofhighlights", displayName: "House of Highlights", niches: [
    { slug: "sports-athletes", isPrimary: true },
  ]},

  // 29. Cars & Automotive
  { handle: "supercarblondie", displayName: "Alex Hirschi", niches: [
    { slug: "cars-automotive", isPrimary: true },
  ]},
  { handle: "doug_demuro", displayName: "Doug DeMuro", niches: [
    { slug: "cars-automotive", isPrimary: true },
  ]},
  { handle: "thestradman", displayName: "The Stradman", niches: [
    { slug: "cars-automotive", isPrimary: true },
  ]},
  { handle: "carthrottle", displayName: "Car Throttle", niches: [
    { slug: "cars-automotive", isPrimary: true },
  ]},
  { handle: "topgear", displayName: "Top Gear", niches: [
    { slug: "cars-automotive", isPrimary: true },
  ]},

  // 30. Spirituality & Astrology
  { handle: "iamhumanco", displayName: "I Am Human Co", niches: [
    { slug: "spirituality-astrology", isPrimary: true },
  ]},
  { handle: "cosmopolitan", displayName: "Cosmopolitan Astrology", niches: [
    { slug: "spirituality-astrology", isPrimary: true },
  ]},
  { handle: "astrology.spirituality", displayName: "Astrology Spirituality", niches: [
    { slug: "spirituality-astrology", isPrimary: true },
  ]},
  { handle: "thehoodwitch", displayName: "The Hoodwitch", niches: [
    { slug: "spirituality-astrology", isPrimary: true },
  ]},
  { handle: "jessicalanyadoo", displayName: "Jessica Lanyadoo", niches: [
    { slug: "spirituality-astrology", isPrimary: true },
  ]},
];

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL env var not set");
    process.exit(1);
  }

  const dbHost = new URL(databaseUrl).hostname;
  const dbType = dbHost.includes("shinkansen")
    ? "STAGING"
    : dbHost.includes("maglev")
    ? "PRODUCTION"
    : "UNKNOWN";
  console.log(`Connecting to: ${dbHost}`);
  console.log(`Database environment: ${dbType}`);
  console.log("Proceeding in 3 seconds. Ctrl+C to abort.");
  await new Promise((r) => setTimeout(r, 3000));

  const conn = await mysql.createConnection(databaseUrl);

  // Sanity check - confirm niches exist
  const [nicheRows]: any = await conn.execute(`SELECT slug, id FROM niches`);
  const nicheMap = new Map<string, number>();
  for (const row of nicheRows) {
    nicheMap.set(row.slug, row.id);
  }
  console.log(`Found ${nicheMap.size} niches in DB`);

  if (nicheMap.size !== 30) {
    console.error(`ERROR: Expected 30 niches in DB, found ${nicheMap.size}. Run seed-niches.ts first.`);
    process.exit(1);
  }

  // Validate every account references a real niche slug
  for (const account of ACCOUNTS) {
    for (const n of account.niches) {
      if (!nicheMap.has(n.slug)) {
        console.error(`ERROR: Account @${account.handle} references unknown niche slug: ${n.slug}`);
        process.exit(1);
      }
    }
  }
  console.log(`All ${ACCOUNTS.length} accounts validated against niche slugs`);

  let insertedCount = 0;
  let updatedCount = 0;
  let junctionCount = 0;

  for (const account of ACCOUNTS) {
    // Insert or update account
    const [result]: any = await conn.execute(
      `INSERT INTO featured_accounts (handle, displayName, isActive)
       VALUES (?, ?, true)
       ON DUPLICATE KEY UPDATE
         displayName = VALUES(displayName),
         isActive = true,
         updatedAt = CURRENT_TIMESTAMP`,
      [account.handle, account.displayName]
    );

    let accountId: number;
    if (result.insertId > 0) {
      accountId = result.insertId;
      insertedCount++;
    } else {
      // Was an update, fetch id
      const [rows]: any = await conn.execute(
        `SELECT id FROM featured_accounts WHERE handle = ?`,
        [account.handle]
      );
      accountId = rows[0].id;
      updatedCount++;
    }

    // Insert niche junctions
    for (const n of account.niches) {
      const nicheId = nicheMap.get(n.slug)!;
      await conn.execute(
        `INSERT INTO featured_account_niches (accountId, nicheId, isPrimary)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE isPrimary = VALUES(isPrimary)`,
        [accountId, nicheId, n.isPrimary]
      );
      junctionCount++;
    }

    console.log(`  ✓ @${account.handle} → ${account.niches.length} niche(s)`);
  }

  console.log(`\n${insertedCount} new accounts inserted, ${updatedCount} updated`);
  console.log(`${junctionCount} niche junction rows created/updated`);

  // Verify
  const [accountTotal]: any = await conn.execute(`SELECT COUNT(*) c FROM featured_accounts`);
  const [junctionTotal]: any = await conn.execute(`SELECT COUNT(*) c FROM featured_account_niches`);
  console.log(`\nTotal featured_accounts: ${accountTotal[0].c}`);
  console.log(`Total featured_account_niches: ${junctionTotal[0].c}`);

  // Per-niche count check
  const [perNiche]: any = await conn.execute(`
    SELECT n.name, n.groupName, COUNT(fan.accountId) as account_count
    FROM niches n
    LEFT JOIN featured_account_niches fan ON fan.nicheId = n.id
    GROUP BY n.id, n.name, n.groupName
    ORDER BY n.sortOrder
  `);
  console.log("\nAccount count per niche:");
  console.table(perNiche);

  await conn.end();
  console.log("\n✓ Seed complete");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
