/**
 * Date restriction utilities for meal planning
 * Restricts past date navigation to one year from account creation date
 */

/**
 * Gets the earliest allowed date based on account creation date
 * Restricts past dates to one year from account creation
 * @param createdAt ISO string of account creation date
 * @returns Date object representing the earliest allowed date
 */
export function getMinimumAllowedDate(createdAt: string): Date {
  try {
    const creationDate = new Date(createdAt);
    const minimumDate = new Date(creationDate);
    minimumDate.setFullYear(minimumDate.getFullYear() - 1);
    return minimumDate;
  } catch {
    // If date parsing fails, default to today (no past dates allowed)
    return new Date();
  }
}

/**
 * Checks if a date is within the allowed range
 * @param date Date to check
 * @param createdAt ISO string of account creation date
 * @returns true if date is on or after minimum allowed date, false otherwise
 */
export function isDateAllowed(date: Date, createdAt: string): boolean {
  const minimumDate = getMinimumAllowedDate(createdAt);
  const dateAtMidnight = new Date(date);
  dateAtMidnight.setHours(0, 0, 0, 0);
  const minimumAtMidnight = new Date(minimumDate);
  minimumAtMidnight.setHours(0, 0, 0, 0);

  return dateAtMidnight >= minimumAtMidnight;
}

/**
 * Checks if a date is in the past (before today at midnight)
 * @param date Date to check
 * @returns true if date is before today, false otherwise
 */
export function isDateInPast(date: Date): boolean {
  const dateAtMidnight = new Date(date);
  dateAtMidnight.setHours(0, 0, 0, 0);
  const todayAtMidnight = new Date();
  todayAtMidnight.setHours(0, 0, 0, 0);

  return dateAtMidnight < todayAtMidnight;
}

/**
 * Validates if a date is selectable based on both restrictions:
 * 1. Not in the past (before today)
 * 2. Within one year of account creation (for dates before today)
 * @param date Date to validate
 * @param createdAt ISO string of account creation date
 * @returns true if date is selectable, false otherwise
 */
export function isDateSelectable(date: Date, createdAt: string): boolean {
  // Never allow selecting future dates that haven't occurred yet
  if (!isDateInPast(date)) {
    return true; // Future dates and today are allowed
  }

  // For past dates, check if within one year of account creation
  return isDateAllowed(date, createdAt);
}
