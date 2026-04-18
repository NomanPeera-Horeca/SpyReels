import "dotenv/config";
import { transcribeReel } from "../server/services/transcribeReel";

const TEST_INPUT = {
  shortcode: "DWHCoc4jdHp",
  videoUrl:
    "https://instagram.fhan4-6.fna.fbcdn.net/o1/v/t16/f2/m69/AQOxA-Zf7zbNkNBlaFVqfHRD0PD5qccaj-feKFZ7koWqnqfAI7qb0ICgSLc8cNVTIhWAK8nrfhLdO_VAH62VBL_T.mp4?strext=1&_nc_cat=109&_nc_oc=Adqbp7ENGmXCI4OxoGG-yAmllcGScIKH5y3rAvHPHUilDS0kkFSl6_hR3h2akMGupBA&_nc_sid=5e9851&_nc_ht=instagram.fhan4-6.fna.fbcdn.net&_nc_ohc=xKqVyVhTezIQ7kNvwEQW3jW&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5JTlNUQUdSQU0uQ0xJUFMuQzMuNzE2LmRhc2hfYmFzZWxpbmVfMV92MSIsInhwdl9hc3NldF9pZCI6MTc5NTI2MDAxMjAxMTQzOTcsImFzc2V0X2FnZV9kYXlzIjoyOSwidmlfdXNlY2FzZV9pZCI6MTAwOTksImR1cmF0aW9uX3MiOjQ0LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&vs=1499d384a4782c15&_nc_vs=HBksFQIYOnBhc3N0aHJvdWdoX2V2ZXJzdG9yZS9HSjZGM3lZbU9JWk9ZemtEQUk2eTQ3ekZRSHN0YnNwVEFRQUYVAALIARIAFQIYUWlnX3hwdl9wbGFjZW1lbnRfcGVybWFuZW50X3YyL0FCNEUyRjkwOTUzRDQ5QTEzNDRGNzhFQTNCMUFCNjg3X2F1ZGlvX2Rhc2hpbml0Lm1wNBUCAsgBEgAoABgAGwKIB3VzZV9vaWwBMRJwcm9ncmVzc2l2ZV9yZWNpcGUBMRUAACa686GP7vLjPxUCKAJDMywXQEX7ZFocrAgYEmRhc2hfYmFzZWxpbmVfMV92MREAdf4HZeadAQA&_nc_gid=kB3WJ7VMWDI4gsv84BCeEA&_nc_zt=28&_nc_ss=7a32e&oh=00_Af2PYKmU8OmWjn5TMqGdvqCV98KlykfoFb2wrbt5aPQVyw&oe=69E9C81F",
};

(async () => {
  try {
    console.log(`Starting test for shortcode: ${TEST_INPUT.shortcode}`);
    console.log("Calling transcribeReel...");

    const start = Date.now();
    const result = await transcribeReel(TEST_INPUT);
    const elapsedSec = (Date.now() - start) / 1000;

    console.log(`Elapsed: ${elapsedSec.toFixed(2)}s`);
    console.log(`success: ${result.success}`);

    if (result.success) {
      console.log("---- transcript ----");
      console.log(result.transcript);
      console.log("--------------------");
      console.log(`segments: ${result.segments.length}`);
      console.log(`durationSec: ${result.durationSec}`);

      const preview = result.segments.slice(0, 3);
      preview.forEach((seg, i) => {
        console.log(
          `  [${i + 1}] start=${seg.start.toFixed(2)} end=${seg.end.toFixed(2)} text=${JSON.stringify(seg.text)}`
        );
      });

      process.exit(0);
    } else {
      console.error(`errorCode: ${result.errorCode}`);
      console.error(`userMessage: ${result.userMessage}`);
      process.exit(1);
    }
  } catch (err) {
    console.error("UNEXPECTED ERROR:");
    if (err instanceof Error) {
      console.error(err.stack ?? err.message);
    } else {
      console.error(err);
    }
    process.exit(2);
  }
})();
