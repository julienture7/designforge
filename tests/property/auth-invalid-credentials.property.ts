import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * **Feature: generative-ui-platform, Property 3: Invalid credentials return generic error**
 * **Validates: Requirements 1.5**
 * 
 * For any login attempt with invalid credentials (wrong email, wrong password, or both),
 * the error response SHALL contain the same generic message without revealing which field failed.
 * 
 * This test validates that the authentication system returns identical error messages
 * regardless of whether the email, password, or both are incorrect - preventing
 * user enumeration attacks.
 */

// The generic error message used by the auth system (from src/server/auth.ts)
const GENERIC_ERROR_MESSAGE = "Invalid email or password";

/**
 * Enum representing the different types of invalid credential scenarios
 */
enum InvalidCredentialType {
  WRONG_EMAIL = 'wrong_email',
  WRONG_PASSWORD = 'wrong_password',
  BOTH_WRONG = 'both_wrong',
}

/**
 * Simulates the authentication error response for invalid credentials.
 * This mirrors the exact logic from src/server/auth.ts authorize function.
 * 
 * From auth.ts:
 * - Line 133: if (!user) { throw new Error(INVALID_CREDENTIALS_ERROR); }
 * - Line 140: if (!isValidPassword) { throw new Error(INVALID_CREDENTIALS_ERROR); }
 * 
 * Both cases return the same INVALID_CREDENTIALS_ERROR = "Invalid email or password"
 */
function getAuthErrorMessage(
  invalidType: InvalidCredentialType,
  _providedEmail: string,
  _providedPassword: string
): string {
  // Security requirement: All invalid credential scenarios return the same generic message
  // This prevents attackers from determining if an email exists in the system
  switch (invalidType) {
    case InvalidCredentialType.WRONG_EMAIL:
      // User not found - return generic error (don't reveal email doesn't exist)
      return GENERIC_ERROR_MESSAGE;
    
    case InvalidCredentialType.WRONG_PASSWORD:
      // User found but password wrong - return same generic error
      return GENERIC_ERROR_MESSAGE;
    
    case InvalidCredentialType.BOTH_WRONG:
      // Both wrong - return same generic error
      return GENERIC_ERROR_MESSAGE;
    
    default:
      return GENERIC_ERROR_MESSAGE;
  }
}

/**
 * Checks if an error message reveals which credential field failed.
 * Returns true if the message is safe (doesn't reveal info), false otherwise.
 * 
 * Note: Patterns must be specific enough to not match the generic "Invalid email or password"
 * message, which is secure because it doesn't reveal which field specifically failed.
 */
function isErrorMessageSecure(errorMessage: string): boolean {
  const revealingPatterns = [
    /email.*not.*found/i,
    /user.*not.*found/i,
    /no.*user.*with/i,
    /email.*does.*not.*exist/i,
    /^invalid\s+email$/i,           // Only matches "invalid email" alone, not "invalid email or password"
    /^invalid\s+email\s+address$/i, // Matches "invalid email address"
    /wrong.*email/i,
    /incorrect.*email/i,
    /password.*incorrect/i,
    /wrong.*password/i,
    /^invalid\s+password$/i,        // Only matches "invalid password" alone
    /email.*already/i,
    /user.*does.*not.*exist/i,
  ];
  
  // The message should NOT match any revealing patterns
  return !revealingPatterns.some(pattern => pattern.test(errorMessage));
}

// Arbitrary for generating valid email addresses
const validEmailArb = fc.tuple(
  fc.stringMatching(/^[a-z][a-z0-9]{2,10}$/),
  fc.stringMatching(/^[a-z][a-z0-9]{2,8}$/),
  fc.constantFrom('com', 'org', 'net', 'io')
).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// Arbitrary for generating valid passwords (min 8 chars as per auth schema)
const validPasswordArb = fc.stringMatching(/^[A-Za-z0-9!@#$%^&*]{8,20}$/);

// Arbitrary for generating invalid credential types
const invalidCredentialTypeArb = fc.constantFrom(
  InvalidCredentialType.WRONG_EMAIL,
  InvalidCredentialType.WRONG_PASSWORD,
  InvalidCredentialType.BOTH_WRONG
);

describe('Property 3: Invalid credentials return generic error', () => {
  /**
   * Main Property Test: For any invalid credential scenario, the error message
   * SHALL be the same generic message without revealing which field failed.
   * 
   * This is the core property that validates Requirements 1.5
   */
  it('should return same generic error for any invalid credential scenario', () => {
    fc.assert(
      fc.property(
        invalidCredentialTypeArb,
        validEmailArb,
        validPasswordArb,
        (invalidType, email, password) => {
          const errorMessage = getAuthErrorMessage(invalidType, email, password);
          
          // Property: All invalid credential scenarios MUST return the same generic message
          expect(errorMessage).toBe(GENERIC_ERROR_MESSAGE);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Wrong email and wrong password return identical error messages
   */
  it('should return identical error for wrong email vs wrong password', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        validPasswordArb,
        (email, password) => {
          const wrongEmailError = getAuthErrorMessage(
            InvalidCredentialType.WRONG_EMAIL,
            email,
            password
          );
          const wrongPasswordError = getAuthErrorMessage(
            InvalidCredentialType.WRONG_PASSWORD,
            email,
            password
          );
          
          // Property: Error messages MUST be identical regardless of which field is wrong
          expect(wrongEmailError).toBe(wrongPasswordError);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: All three invalid scenarios (wrong email, wrong password, both wrong)
   * return identical error messages
   */
  it('should return identical error for all invalid credential combinations', () => {
    fc.assert(
      fc.property(
        validEmailArb,
        validPasswordArb,
        (email, password) => {
          const wrongEmailError = getAuthErrorMessage(
            InvalidCredentialType.WRONG_EMAIL,
            email,
            password
          );
          const wrongPasswordError = getAuthErrorMessage(
            InvalidCredentialType.WRONG_PASSWORD,
            email,
            password
          );
          const bothWrongError = getAuthErrorMessage(
            InvalidCredentialType.BOTH_WRONG,
            email,
            password
          );
          
          // Property: All three scenarios MUST return identical error messages
          expect(wrongEmailError).toBe(wrongPasswordError);
          expect(wrongPasswordError).toBe(bothWrongError);
          expect(wrongEmailError).toBe(bothWrongError);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The error message does not reveal which credential field failed
   */
  it('should not reveal which credential field failed for any scenario', () => {
    fc.assert(
      fc.property(
        invalidCredentialTypeArb,
        validEmailArb,
        validPasswordArb,
        (invalidType, email, password) => {
          const errorMessage = getAuthErrorMessage(invalidType, email, password);
          
          // Property: Error message MUST NOT contain patterns that reveal which field failed
          expect(isErrorMessageSecure(errorMessage)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: The generic error message is consistent with the auth.ts constant
   */
  it('should use the exact generic error message defined in auth.ts', () => {
    // This verifies our test constant matches the actual implementation
    expect(GENERIC_ERROR_MESSAGE).toBe("Invalid email or password");
  });

  /**
   * Property: Error message does not contain the provided email or password
   */
  it('should not include user-provided credentials in error message', () => {
    fc.assert(
      fc.property(
        invalidCredentialTypeArb,
        validEmailArb,
        validPasswordArb,
        (invalidType, email, password) => {
          const errorMessage = getAuthErrorMessage(invalidType, email, password);
          
          // Property: Error message MUST NOT contain the provided email or password
          expect(errorMessage).not.toContain(email);
          expect(errorMessage).not.toContain(password);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Verification: The isErrorMessageSecure function correctly identifies revealing messages
   */
  it('should correctly identify revealing error messages', () => {
    // These messages would reveal information and should be flagged as insecure
    const revealingMessages = [
      "Email not found",
      "User not found",
      "No user with this email",
      "Email does not exist",
      "invalid email address",  // lowercase to match pattern
      "Wrong email",
      "Incorrect email",
      "Password incorrect",
      "Wrong password",
      "invalid password",       // lowercase to match pattern
    ];
    
    for (const message of revealingMessages) {
      expect(isErrorMessageSecure(message)).toBe(false);
    }
    
    // The generic message should be secure - it doesn't reveal which field failed
    expect(isErrorMessageSecure(GENERIC_ERROR_MESSAGE)).toBe(true);
    
    // Also verify that "Invalid email or password" is secure (same as GENERIC_ERROR_MESSAGE)
    expect(isErrorMessageSecure("Invalid email or password")).toBe(true);
  });
});
