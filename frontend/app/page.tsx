import { LandingPage } from "@/src/components/landing-page";
import { generateSchemaScript, getSoftwareApplicationSchema } from "@/src/seo/schema";

export default function HomePage() {
  const appSchema = getSoftwareApplicationSchema();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={generateSchemaScript(appSchema)}
      />
      <LandingPage />
    </>
  );
}
