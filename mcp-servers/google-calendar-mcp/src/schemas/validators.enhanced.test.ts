import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Enhanced schema with recurring event support
const isoDateTimeWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;

const ReminderSchema = z.object({
  method: z.enum(['email', 'popup']).default('popup'),
  minutes: z.number(),
});

const RemindersSchema = z.object({
  useDefault: z.boolean(),
  overrides: z.array(ReminderSchema).optional(),
});

// Enhanced UpdateEventArgumentsSchema with recurring event support
export const EnhancedUpdateEventArgumentsSchema = z.object({
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

describe('Enhanced UpdateEventArgumentsSchema', () => {
  describe('Basic Validation', () => {
    it('should validate basic required fields', () => {
      const validArgs = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles'
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(validArgs);
      expect(result.modificationScope).toBe('all'); // default value
      expect(result.calendarId).toBe('primary');
      expect(result.eventId).toBe('event123');
      expect(result.timeZone).toBe('America/Los_Angeles');
    });

    it('should reject missing required fields', () => {
      const invalidArgs = {
        calendarId: 'primary',
        // missing eventId and timeZone
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(invalidArgs)).toThrow();
    });

    it('should validate optional fields when provided', () => {
      const validArgs = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        summary: 'Updated Meeting',
        description: 'Updated description',
        location: 'New Location',
        colorId: '9',
        start: '2024-06-15T10:00:00-07:00',
        end: '2024-06-15T11:00:00-07:00'
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(validArgs);
      expect(result.summary).toBe('Updated Meeting');
      expect(result.description).toBe('Updated description');
      expect(result.location).toBe('New Location');
      expect(result.colorId).toBe('9');
    });
  });

  describe('Modification Scope Validation', () => {
    it('should default modificationScope to "all"', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles'
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(args);
      expect(result.modificationScope).toBe('all');
    });

    it('should accept valid modificationScope values', () => {
      const validScopes = ['single', 'all', 'future'] as const;

      validScopes.forEach(scope => {
        const args: any = {
          calendarId: 'primary',
          eventId: 'event123',
          timeZone: 'America/Los_Angeles',
          modificationScope: scope
        };

        // Add required fields for each scope
        if (scope === 'single') {
          args.originalStartTime = '2024-06-15T10:00:00-07:00';
        } else if (scope === 'future') {
          args.futureStartDate = '2025-12-31T10:00:00-08:00';
        }

        const result = EnhancedUpdateEventArgumentsSchema.parse(args);
        expect(result.modificationScope).toBe(scope);
      });
    });

    it('should reject invalid modificationScope values', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'invalid'
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow();
    });
  });

  describe('Single Instance Scope Validation', () => {
    it('should require originalStartTime when modificationScope is "single"', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'single'
        // missing originalStartTime
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow(
        /originalStartTime is required when modificationScope is 'single'/
      );
    });

    it('should accept valid originalStartTime for single scope', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'single',
        originalStartTime: '2024-06-15T10:00:00-07:00'
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(args);
      expect(result.modificationScope).toBe('single');
      expect(result.originalStartTime).toBe('2024-06-15T10:00:00-07:00');
    });

    it('should reject invalid originalStartTime format', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'single',
        originalStartTime: '2024-06-15 10:00:00' // invalid format
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow();
    });

    it('should accept originalStartTime without timezone designator error', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'single',
        originalStartTime: '2024-06-15T10:00:00' // missing timezone
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow();
    });
  });

  describe('Future Instances Scope Validation', () => {
    it('should require futureStartDate when modificationScope is "future"', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'future'
        // missing futureStartDate
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow(
        /futureStartDate is required when modificationScope is 'future'/
      );
    });

    it('should accept valid futureStartDate for future scope', () => {
      const futureDate = new Date('2025-06-15T10:00:00Z'); // Use a specific future date
      const futureDateString = futureDate.toISOString();

      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'future',
        futureStartDate: futureDateString
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(args);
      expect(result.modificationScope).toBe('future');
      expect(result.futureStartDate).toBe(futureDateString);
    });

    it('should reject futureStartDate in the past', () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      const pastDateString = pastDate.toISOString();

      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'future',
        futureStartDate: pastDateString
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow(
        /futureStartDate must be in the future/
      );
    });

    it('should reject invalid futureStartDate format', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'future',
        futureStartDate: '2024-12-31 10:00:00' // invalid format
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow();
    });
  });

  describe('Datetime Format Validation', () => {
    const validDatetimes = [
      '2024-06-15T10:00:00Z',
      '2024-06-15T10:00:00-07:00',
      '2024-06-15T10:00:00+05:30',
      '2024-12-31T23:59:59-08:00'
    ];

    const invalidDatetimes = [
      '2024-06-15T10:00:00',     // missing timezone
      '2024-06-15 10:00:00Z',    // space instead of T
      '24-06-15T10:00:00Z',      // short year
      '2024-6-15T10:00:00Z',     // single digit month
      '2024-06-15T10:00Z'        // missing seconds
    ];

    validDatetimes.forEach(datetime => {
      it(`should accept valid datetime format: ${datetime}`, () => {
        const args = {
          calendarId: 'primary',
          eventId: 'event123',
          timeZone: 'America/Los_Angeles',
          start: datetime,
          end: datetime
        };

        expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).not.toThrow();
      });
    });

    invalidDatetimes.forEach(datetime => {
      it(`should reject invalid datetime format: ${datetime}`, () => {
        const args = {
          calendarId: 'primary',
          eventId: 'event123',
          timeZone: 'America/Los_Angeles',
          start: datetime
        };

        expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).toThrow();
      });
    });
  });

  describe('Complex Scenarios', () => {
    it('should validate complete update with all fields', () => {
      const futureDate = new Date('2025-06-15T10:00:00Z'); // Use a specific future date

      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'future',
        futureStartDate: futureDate.toISOString(),
        summary: 'Updated Meeting',
        description: 'Updated description',
        location: 'New Conference Room',
        start: '2024-06-15T10:00:00-07:00',
        end: '2024-06-15T11:00:00-07:00',
        colorId: '9',
        attendees: [
          { email: 'user1@example.com' },
          { email: 'user2@example.com' }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 1440 },
            { method: 'popup', minutes: 10 }
          ]
        },
        recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO']
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(args);
      expect(result).toMatchObject(args);
    });

    it('should not require conditional fields for "all" scope', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'all',
        summary: 'Updated Meeting'
        // no originalStartTime or futureStartDate required
      };

      expect(() => EnhancedUpdateEventArgumentsSchema.parse(args)).not.toThrow();
    });

    it('should allow optional conditional fields when not required', () => {
      const args = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        modificationScope: 'all',
        originalStartTime: '2024-06-15T10:00:00-07:00', // optional for 'all' scope
        summary: 'Updated Meeting'
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(args);
      expect(result.originalStartTime).toBe('2024-06-15T10:00:00-07:00');
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain compatibility with existing update calls', () => {
      // Existing call format without new parameters
      const legacyArgs = {
        calendarId: 'primary',
        eventId: 'event123',
        timeZone: 'America/Los_Angeles',
        summary: 'Updated Meeting',
        location: 'Conference Room A'
      };

      const result = EnhancedUpdateEventArgumentsSchema.parse(legacyArgs);
      expect(result.modificationScope).toBe('all'); // default
      expect(result.summary).toBe('Updated Meeting');
      expect(result.location).toBe('Conference Room A');
    });
  });
}); 