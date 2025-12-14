"use server";

import { runFullPolishPipeline, POLISH_PHASES } from "~/server/services/deepseek.service";

/**
 * Server Action to run the polish pipeline on HTML content.
 * Returns the polished HTML and stats.
 */
export async function polishHtmlAction(html: string) {
    try {
        const result = await runFullPolishPipeline(html);
        return { success: true, ...result };
    } catch (error) {
        console.error("Polish action failed:", error);
        return { success: false, error: "Failed to polish design" };
    }
}

export async function getPolishPhases() {
    return POLISH_PHASES.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon
    }));
}
