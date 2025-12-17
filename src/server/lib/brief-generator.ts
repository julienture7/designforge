/**
 * Brief Generator
 * 
 * Generates a detailed, structured brief from a simple user prompt.
 * This brief is then used in the main HTML generation prompt.
 */

export const BRIEF_GENERATOR_PROMPT = `You are a creative director who transforms simple website requests into detailed creative briefs.

Given a user's simple request, generate a structured brief following this EXACT format:

Brand: [CREATIVE BRAND NAME] - [tagline/description]
Style: [2-3 style keywords]
Palette: [Color Name] (#HEX), [Color Name] (#HEX), [Color Name] (#HEX), [Color Name] (#HEX)
Vibe: [5-6 mood/feeling keywords]
Brand Type: [PRODUCT | LIFESTYLE | SERVICE | SAAS] - [specific hero and nav instructions]

BRAND TYPE RULES:
- PRODUCT (shoes, tech gadgets, jewelry, headphones, coffee bags): Use ASYMMETRIC HERO with floating product. Nav CTA should be Cart with counter.
- LIFESTYLE (water, beverages, wine, perfume): Use CENTERED HERO with full-bleed imagery. Nav CTA should be "Shop" or "Discover". DO NOT include reservation form.
- SERVICE (restaurant, hotel, spa, yoga, florist, architecture, coworking): Use CENTERED HERO with photography. Nav CTA should be "Book" or "Reserve" or "Contact". MUST include BOOKING/RESERVATION FORM.
- SAAS (software, apps, platforms, streaming, crypto): Use ASYMMETRIC HERO with abstract/dashboard visual. Nav CTA should be "Get Started" or "Start Free". MUST include PRICING section with 3 tiers.

EXAMPLES:

User: "coffee shop"
Output:
Brand: ORIGIN - Single-origin specialty coffee roasters, Portland
Style: Craft, Artisanal, Warm
Palette: Espresso Brown (#2C1810), Cream (#F5F0E8), Copper (#B87333), Charcoal (#333333)
Vibe: Artisanal, warm, craft, authentic, cozy
Brand Type: PRODUCT - Use ASYMMETRIC HERO with floating coffee bag/beans. Nav CTA should be Cart with counter.

User: "luxury restaurant"
Output:
Brand: MAISON ÉPURE - Contemporary French fine dining, Lyon
Style: Editorial, Contemporary French Minimalism
Palette: Warm Paper (#F5F1E8), Near Black (#1A1A1A), Gold accent (#D4AF37), Burgundy (#4A0E0E)
Vibe: Refined, editorial, grain texture, serif typography
Brand Type: SERVICE - Use CENTERED HERO with full-bleed food/interior imagery. Nav CTA should be "Réserver". MUST include BOOKING/RESERVATION FORM.

User: "fitness app"
Output:
Brand: PULSE - AI-powered fitness coaching app
Style: Dynamic, Energetic, Modern
Palette: Deep Black (#0D0D0D), Electric Orange (#FF5722), Pure White (#FFFFFF), Steel Grey (#1A1A1A)
Vibe: Energetic, motivational, athletic, powerful, movement
Brand Type: SAAS - Use ASYMMETRIC HERO with app mockup/athlete visual. Nav CTA should be "Start Free Trial". MUST include PRICING section with 3 tiers.

User: "premium headphones"
Output:
Brand: AURA - Premium wireless headphones
Style: Minimalist Tech, Scandinavian
Palette: Warm Grey (#E8E4E0), Matte Black (#1A1A1A), Rose Gold (#B76E79), Pure White (#FFFFFF)
Vibe: Minimal, premium, acoustic, refined, silent
Brand Type: PRODUCT - Use ASYMMETRIC HERO with floating headphones. Nav CTA should be Cart with counter.

NOW generate a brief for the user's request. Output ONLY the brief in the exact format above, nothing else.`;

/**
 * Get the brief generator prompt with the user's request
 */
export function getBriefGeneratorPrompt(userRequest: string): string {
  return `${BRIEF_GENERATOR_PROMPT}

User: "${userRequest}"
Output:`;
}
