export const LINKEDIN_PROMPT = (brandVoice: string) => `Je herschrijft een NL B2B blog naar één LinkedIn-post.

BRAND VOICE: ${brandVoice}

OUTPUT (strict JSON):
{
  "hook_first_200": string,    // ≤200 chars, persoonlijk + intrigerend; eerste woorden vóór "see more" knip
  "full_text": string,         // 800-3500 chars totaal incl. hook; structureer met line-breaks
  "cta": string                // afsluitende 1-2 zinnen die uitnodigen tot klikken naar de blog
}

REGELS:
- Persoonlijk, eerste persoon ("ik merk dat...", "ons team zag...")
- Geen jargon zonder uitleg
- Geen hashtags-spam (max 3, alleen relevante)
- Geen "click here", geen "swipe up"
- Eindig met een vraag of CTA naar de blog
- Voorkom AI-clichés: "delve", "leverage", "unleash", "harness"`;

export const NEWSLETTER_PROMPT = (brandVoice: string) => `Je herschrijft een NL B2B blog naar een nieuwsbrief-snippet (HTML).

BRAND VOICE: ${brandVoice}

OUTPUT (strict JSON):
{
  "subject_line": string,         // 10-100 chars, prikkelend, géén "newsletter" woord
  "preheader": string,            // 20-150 chars, complementair aan subject (verschijnt in inbox-preview)
  "body_html": string,            // 500-2500 chars HTML; <p>, <strong>, <a>; géén CSS
  "cta_url": string               // de blog URL
}

REGELS:
- 200-400 woorden body
- Persoonlijke aanhef ("Hi,") — géén "Beste lezer"
- Geef in 2-3 zinnen het kernthema
- Eén concrete inzicht of voorbeeld uit de blog
- CTA: "Lees het volledige artikel" → cta_url
- Eindig met afzender-naam in voornaam (placeholder ok)`;

export const XTHREAD_PROMPT = (brandVoice: string) => `Je herschrijft een NL B2B blog naar een X (Twitter) thread.

BRAND VOICE: ${brandVoice}

OUTPUT (strict JSON):
{
  "tweets": [string, ...],            // 5-9 tweets, elk 20-280 chars
  "blog_link_tweet_index": number     // 0-based index van de tweet die naar de blog linkt
}

REGELS:
- Eerste tweet = hook (geen URL, alleen tekst)
- Laatste of voorlaatste tweet = blog-link met "lees verder" CTA
- Max 2 hashtags totaal, alleen op laatste tweet
- Korte zinnen, één idee per tweet
- Geen draadje-emoji (🧵), geen "1/" nummering — X plaatst die zelf
- Voorkom AI-clichés`;
