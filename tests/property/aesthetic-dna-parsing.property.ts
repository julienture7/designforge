import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { extractAestheticDNA, type AestheticDNA } from '../../src/server/lib/html-processor';

/**
 * **Feature: generative-ui-platform, Property 5: AESTHETIC_DNA parsing extracts metadata**
 * **Validates: Requirements 2.6**
 * 
 * For any AI response containing a valid AESTHETIC_DNA comment block, parsing SHALL
 * extract a structured object with `name`, `keywords`, `palette`, and `typography` fields.
 * 
 * Requirements 2.6 specifies:
 * "WHEN the AI outputs an AESTHETIC_DNA comment block THEN the Generation_Engine SHALL
 * parse using regex `/<!--\s*AESTHETIC_DNA:[\s\S]*?-->/` and emit a structured
 * `{ type: 'metadata', data: parsedDNA }` event before HTML content"
 */

/**
 * Arbitrary for generating valid theme names.
 * Names should be non-empty strings without special characters that could break parsing.
 * Note: The parser trims whitespace from values, so we generate names without leading/trailing spaces.
 */
const themeNameArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9 -]{0,30}$/)
  .filter(s => s.trim().length > 0)
  .map(s => s.trim()); // Ensure no leading/trailing whitespace since parser trims values

/**
 * Arbitrary for generating valid keywords.
 * Keywords are simple words that describe the theme.
 */
const keywordArb = fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/)
  .filter(s => s.trim().length > 0);

/**
 * Arbitrary for generating valid color palette entries.
 * Colors can be hex codes or named colors.
 */
const hexColorArb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 })
).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

const colorArb = fc.oneof(
  // Hex colors
  hexColorArb,
  // Named colors
  fc.constantFrom('red', 'blue', 'green', 'white', 'black', 'gray', 'slate', 'zinc')
);

/**
 * Arbitrary for generating valid typography entries.
 * Typography entries are font family names.
 */
const typographyArb = fc.constantFrom(
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'system-ui', 'sans-serif', 'serif', 'monospace',
  'Poppins', 'Nunito', 'Raleway', 'Playfair Display'
);

/**
 * Arbitrary for generating a list of keywords (1-5 items).
 */
const keywordsListArb = fc.array(keywordArb, { minLength: 1, maxLength: 5 })
  .map(arr => [...new Set(arr)]); // Remove duplicates

/**
 * Arbitrary for generating a color palette (1-6 colors).
 */
const paletteListArb = fc.array(colorArb, { minLength: 1, maxLength: 6 })
  .map(arr => [...new Set(arr)]); // Remove duplicates

/**
 * Arbitrary for generating typography list (1-3 fonts).
 */
const typographyListArb = fc.array(typographyArb, { minLength: 1, maxLength: 3 })
  .map(arr => [...new Set(arr)]); // Remove duplicates

/**
 * Interface for generated AESTHETIC_DNA test data.
 */
interface AestheticDNATestData {
  name: string;
  keywords: string[];
  palette: string[];
  typography: string[];
}

/**
 * Arbitrary for generating complete AESTHETIC_DNA data.
 */
const aestheticDNADataArb: fc.Arbitrary<AestheticDNATestData> = fc.record({
  name: themeNameArb,
  keywords: keywordsListArb,
  palette: paletteListArb,
  typography: typographyListArb,
});

/**
 * Generates a valid AESTHETIC_DNA comment block from test data.
 */
function generateAestheticDNAComment(data: AestheticDNATestData): string {
  return `<!-- AESTHETIC_DNA:
name: ${data.name}
keywords: ${data.keywords.join(', ')}
palette: ${data.palette.join(', ')}
typography: ${data.typography.join(', ')}
-->`;
}

/**
 * Arbitrary for generating HTML with embedded AESTHETIC_DNA comment.
 */
const htmlWithAestheticDNAArb = aestheticDNADataArb.map(data => ({
  data,
  html: `<!DOCTYPE html>
<html>
${generateAestheticDNAComment(data)}
<head>
  <title>Generated Page</title>
</head>
<body>
  <h1>Hello World</h1>
</body>
</html>`
}));

describe('Property 5: AESTHETIC_DNA parsing extracts metadata', () => {
  /**
   * Main Property Test: For any valid AESTHETIC_DNA comment block,
   * parsing SHALL extract a structured object with all required fields.
   * 
   * This validates Requirements 2.6
   */
  it('should extract structured metadata from any valid AESTHETIC_DNA comment block', () => {
    fc.assert(
      fc.property(
        htmlWithAestheticDNAArb,
        ({ data, html }) => {
          const result = extractAestheticDNA(html);
          
          // Property: Result MUST NOT be null for valid AESTHETIC_DNA
          expect(result).not.toBeNull();
          
          // Property: Result MUST have all required fields
          expect(result).toHaveProperty('name');
          expect(result).toHaveProperty('keywords');
          expect(result).toHaveProperty('palette');
          expect(result).toHaveProperty('typography');
          
          // Property: Extracted name MUST match input name
          expect(result?.name).toBe(data.name);
          
          // Property: Extracted keywords MUST match input keywords
          expect(result?.keywords).toEqual(data.keywords);
          
          // Property: Extracted palette MUST match input palette
          expect(result?.palette).toEqual(data.palette);
          
          // Property: Extracted typography MUST match input typography
          expect(result?.typography).toEqual(data.typography);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Parsing is consistent - same input always produces same output.
   */
  it('should produce consistent results for the same input', () => {
    fc.assert(
      fc.property(
        htmlWithAestheticDNAArb,
        ({ html }) => {
          const result1 = extractAestheticDNA(html);
          const result2 = extractAestheticDNA(html);
          
          // Property: Multiple parses of same input MUST produce identical results
          expect(result1).toEqual(result2);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: AESTHETIC_DNA can appear anywhere in the HTML document.
   */
  it('should extract AESTHETIC_DNA regardless of position in HTML', () => {
    const positionVariantArb = aestheticDNADataArb.chain(data => {
      const comment = generateAestheticDNAComment(data);
      return fc.constantFrom(
        // At the beginning
        { data, html: `${comment}<html><head></head><body></body></html>` },
        // In the head
        { data, html: `<html><head>${comment}</head><body></body></html>` },
        // In the body
        { data, html: `<html><head></head><body>${comment}<p>Content</p></body></html>` },
        // At the end
        { data, html: `<html><head></head><body></body></html>${comment}` }
      );
    });

    fc.assert(
      fc.property(
        positionVariantArb,
        ({ data, html }) => {
          const result = extractAestheticDNA(html);
          
          // Property: AESTHETIC_DNA MUST be extracted regardless of position
          expect(result).not.toBeNull();
          expect(result?.name).toBe(data.name);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Partial AESTHETIC_DNA (with only some fields) should still be parsed.
   */
  it('should handle partial AESTHETIC_DNA with only name field', () => {
    fc.assert(
      fc.property(
        themeNameArb,
        (name) => {
          const html = `<!-- AESTHETIC_DNA:
name: ${name}
-->`;
          const result = extractAestheticDNA(html);
          
          // Property: Partial AESTHETIC_DNA with name MUST be extracted
          expect(result).not.toBeNull();
          expect(result?.name).toBe(name);
          
          // Property: Missing fields MUST default to empty arrays
          expect(result?.keywords).toEqual([]);
          expect(result?.palette).toEqual([]);
          expect(result?.typography).toEqual([]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Keywords array preserves order and content.
   */
  it('should preserve keyword order and content', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeNameArb, keywordsListArb),
        ([name, keywords]) => {
          const html = `<!-- AESTHETIC_DNA:
name: ${name}
keywords: ${keywords.join(', ')}
-->`;
          const result = extractAestheticDNA(html);
          
          // Property: Keywords MUST be extracted in order
          expect(result?.keywords).toEqual(keywords);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Palette colors are extracted correctly.
   */
  it('should extract palette colors correctly', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeNameArb, paletteListArb),
        ([name, palette]) => {
          const html = `<!-- AESTHETIC_DNA:
name: ${name}
palette: ${palette.join(', ')}
-->`;
          const result = extractAestheticDNA(html);
          
          // Property: Palette MUST be extracted correctly
          expect(result?.palette).toEqual(palette);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Typography fonts are extracted correctly.
   */
  it('should extract typography fonts correctly', () => {
    fc.assert(
      fc.property(
        fc.tuple(themeNameArb, typographyListArb),
        ([name, typography]) => {
          const html = `<!-- AESTHETIC_DNA:
name: ${name}
typography: ${typography.join(', ')}
-->`;
          const result = extractAestheticDNA(html);
          
          // Property: Typography MUST be extracted correctly
          expect(result?.typography).toEqual(typography);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: HTML without AESTHETIC_DNA returns null.
   */
  it('should return null for HTML without AESTHETIC_DNA', () => {
    const htmlWithoutDNAArb = fc.constantFrom(
      '<html><head></head><body></body></html>',
      '<!DOCTYPE html><html><body><p>Hello</p></body></html>',
      '<div>Just some content</div>',
      '<!-- Regular comment --><html></html>',
      '<!-- Not AESTHETIC_DNA: something else -->'
    );

    fc.assert(
      fc.property(
        htmlWithoutDNAArb,
        (html) => {
          const result = extractAestheticDNA(html);
          
          // Property: HTML without AESTHETIC_DNA MUST return null
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Empty or invalid input returns null.
   */
  it('should return null for empty or invalid input', () => {
    const invalidInputArb = fc.constantFrom(
      '',
      '   ',
      '\n\n',
      '<!-- AESTHETIC_DNA: -->',  // Empty content
      '<!-- AESTHETIC_DNA:\n-->'  // Only whitespace
    );

    fc.assert(
      fc.property(
        invalidInputArb,
        (input) => {
          const result = extractAestheticDNA(input);
          
          // Property: Invalid input MUST return null
          expect(result).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});
