import { z } from 'zod';

// Zod schemas for input validation

export const ReminderSchema = z.object({
  method: z.enum(['email', 'popup']).default('popup'),
  minutes: z.number(),
});

export const RemindersSchema = z.object({
  useDefault: z.boolean(),
  overrides: z.array(ReminderSchema).optional(),
});

// ISO datetime regex that requires timezone designator (Z or +/-HH:MM)
const isoDateTimeWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

export const ListEventsArgumentsSchema = z.object({
  calendarId: z.preprocess(
    (val) => {
      // If it's a string that looks like JSON array, try to parse it
      if (typeof val === 'string' && val.startsWith('[') && val.endsWith(']')) {
        try {
          return JSON.parse(val);
        } catch {
          // If parsing fails, return as-is (will be validated as string)
          return val;
        }
      }
      return val;
    },
    z.union([
      z.string().min(1, "Calendar ID cannot be empty"),
      z.array(z.string().min(1, "Calendar ID cannot be empty"))
        .min(1, "At least one calendar ID is required")
        .max(50, "Maximum 50 calendars allowed per request")
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "Duplicate calendar IDs are not allowed"
        )
    ])
  ).describe("Calendar ID(s) to fetch events from"),
  timeMin: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional()
    .describe("Start time for event filtering"),
  timeMax: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional()
    .describe("End time for event filtering"),
}).refine(
  (data) => {
    if (data.timeMin && data.timeMax) {
      return new Date(data.timeMin) < new Date(data.timeMax);
    }
    return true;
  },
  {
    message: "timeMin must be before timeMax",
    path: ["timeMax"]
  }
);

export const SearchEventsArgumentsSchema = z.object({
  calendarId: z.string(),
  query: z.string(),
  timeMin: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional(),
  timeMax: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-12-31T23:59:59Z)")
    .optional(),
});

export const CreateEventArgumentsSchema = z.object({
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  start: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  end: z.string().regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  timeZone: z.string(),
  attendees: z
    .array(
      z.object({
        email: z.string(),
      })
    )
    .optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  reminders: RemindersSchema.optional(),
  recurrence: z.array(z.string()).optional(),
});

export const UpdateEventArgumentsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional(),
  end: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional(),
  timeZone: z.string(), // Required even if start/end don't change, per API docs for patch
  attendees: z
    .array(
      z.object({
        email: z.string(),
      })
    )
    .optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  reminders: RemindersSchema.optional(),
  recurrence: z.array(z.string()).optional(),
  // New recurring event parameters
  modificationScope: z.enum(['single', 'all', 'future']).default('all'),
  originalStartTime: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional(),
  futureStartDate: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)")
    .optional(),
}).refine(
  (data) => {
    // Require originalStartTime when modificationScope is 'single'
    if (data.modificationScope === 'single' && !data.originalStartTime) {
      return false;
    }
    return true;
  },
  {
    message: "originalStartTime is required when modificationScope is 'single'",
    path: ["originalStartTime"]
  }
).refine(
  (data) => {
    // Require futureStartDate when modificationScope is 'future'
    if (data.modificationScope === 'future' && !data.futureStartDate) {
      return false;
    }
    return true;
  },
  {
    message: "futureStartDate is required when modificationScope is 'future'",
    path: ["futureStartDate"]
  }
).refine(
  (data) => {
    // Ensure futureStartDate is in the future when provided
    if (data.futureStartDate) {
      const futureDate = new Date(data.futureStartDate);
      const now = new Date();
      return futureDate > now;
    }
    return true;
  },
  {
    message: "futureStartDate must be in the future",
    path: ["futureStartDate"]
  }
);

export const DeleteEventArgumentsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
});

export const FreeBusyEventArgumentsSchema = z.object({
  timeMin: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  timeMax: z.string()
    .regex(isoDateTimeWithTimezone, "Must be ISO format with timezone (e.g., 2024-01-01T00:00:00Z)"),
  timeZone: z.string().optional(),
  groupExpansionMax: z.number().int().max(100).optional(),
  calendarExpansionMax: z.number().int().max(50).optional(),
  items: z.array(z.object({
    id: z.string().email("Must be a valid email address"),
  })),
});