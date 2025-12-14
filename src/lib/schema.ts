import { z } from "zod";

export const WebsiteSectionSchema = z.object({
    id: z.string().describe("Unique identifier for the section"),
    type: z.enum([
        "hero",
        "features",
        "pricing",
        "testimonials",
        "faq",
        "cta",
        "footer",
        "header",
        "contact",
        "gallery",
        "stats",
        "team",
        "blog-preview",
        "custom"
    ]).describe("The semantic type of the section"),
    html: z.string().describe("The complete HTML for this section. Must be self-contained within a semantic tag (e.g. <section>, <header>, <footer>). Use Tailwind CSS classes."),
    content: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
    }).optional().describe("Structured content for easier editing later")
});

export const WebsiteSchema = z.object({
    theme: z.enum(["brutalism", "minimal", "luxury", "corporate", "playful"]).describe("The overall design theme"),
    colors: z.object({
        primary: z.string(),
        secondary: z.string(),
        background: z.string(),
        text: z.string(),
    }).describe("Color palette used"),
    sections: z.array(WebsiteSectionSchema).describe("The sections that make up the page"),
});

export type WebsiteSection = z.infer<typeof WebsiteSectionSchema>;
export type Website = z.infer<typeof WebsiteSchema>;
