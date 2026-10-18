// =============================================================================
// lib/validators.js
//
// Pure validation functions for form inputs. Every function returns:
//   { valid: boolean, message: string | null }
//
// These are framework-agnostic — use them with any form library or directly
// in onChange / onBlur handlers.
//
// For React Hook Form / Zod integration, use the `rules` exports at the bottom.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

/**
 * required
 * Passes if the value is non-empty after trimming.
 *
 * @param {*}      value
 * @param {string} [fieldName]  Human-readable field label for the error message
 */
export function required(value, fieldName = "This field") {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0);

  return empty
    ? { valid: false, message: `${fieldName} is required` }
    : { valid: true, message: null };
}

/**
 * minLength
 * @param {string} value
 * @param {number} min
 * @param {string} [fieldName]
 */
export function minLength(value, min, fieldName = "This field") {
  if (!value || value.length < min) {
    return {
      valid: false,
      message: `${fieldName} must be at least ${min} characters`,
    };
  }
  return { valid: true, message: null };
}

/**
 * maxLength
 * @param {string} value
 * @param {number} max
 * @param {string} [fieldName]
 */
export function maxLength(value, max, fieldName = "This field") {
  if (value && value.length > max) {
    return {
      valid: false,
      message: `${fieldName} must be at most ${max} characters`,
    };
  }
  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Email
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateEmail
 * Checks format only — does not ping any server.
 *
 * @param {string} email
 * @returns {{ valid: boolean, message: string | null }}
 */
export function validateEmail(email) {
  if (!email || !email.trim()) {
    return { valid: false, message: "Email address is required" };
  }

  // RFC 5322 simplified pattern (covers 99.9% of real addresses)
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!pattern.test(email.trim().toLowerCase())) {
    return { valid: false, message: "Enter a valid email address" };
  }

  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Kenya Phone Number
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateKEPhone
 * Accepts:  07xx xxx xxx,  +254 7xx xxx xxx,  254 7xx xxx xxx
 * Kenya mobile prefixes: 07x (Safaricom 071-079, Airtel 073-077, Telkom 077)
 *                        01x (Safaricom 011-012)
 *
 * @param {string} phone
 * @returns {{ valid: boolean, message: string | null }}
 */
export function validateKEPhone(phone) {
  if (!phone || !phone.trim()) {
    return { valid: false, message: "Phone number is required" };
  }

  const digits = String(phone).replace(/[\s\-().+]/g, "");

  // Allow 07xx, 254 7xx, +2547xx, 01x, 2541x formats
  const patterns = [
    /^0[17]\d{8}$/, // 07xxxxxxxx or 01xxxxxxxx
    /^254[17]\d{8}$/, // 2547xxxxxxxx
    /^\+254[17]\d{8}$/, // +2547xxxxxxxx
    /^[17]\d{8}$/, // 7xxxxxxxx (9 digits, no prefix)
  ];

  const valid = patterns.some((p) => p.test(digits));
  return valid
    ? { valid: true, message: null }
    : {
        valid: false,
        message: "Enter a valid Kenya phone number (e.g. 0712 345 678)",
      };
}

// ─────────────────────────────────────────────────────────────────────────────
// Password
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validatePassword
 * Returns granular feedback for the password strength meter.
 *
 * @param {string} password
 * @returns {{
 *   valid:    boolean,
 *   message:  string | null,
 *   strength: 0 | 1 | 2 | 3 | 4,   // 0=empty 1=weak 2=fair 3=strong 4=very strong
 *   checks: {
 *     length:    boolean,   // >= 8 chars
 *     uppercase: boolean,   // has A-Z
 *     lowercase: boolean,   // has a-z
 *     number:    boolean,   // has 0-9
 *     special:   boolean,   // has !@#$...
 *   }
 * }}
 */
export function validatePassword(password) {
  if (!password) {
    return {
      valid: false,
      message: "Password is required",
      strength: 0,
      checks: allFalse(),
    };
  }

  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };

  const passed = Object.values(checks).filter(Boolean).length;
  const strength = Math.min(4, passed); // 0–4

  if (!checks.length) {
    return {
      valid: false,
      message: "Password must be at least 8 characters",
      strength,
      checks,
    };
  }

  if (strength < 2) {
    return {
      valid: false,
      message: "Password is too weak — add numbers or uppercase letters",
      strength,
      checks,
    };
  }

  return { valid: true, message: null, strength, checks };
}

function allFalse() {
  return {
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  };
}

/**
 * validatePasswordMatch
 * Checks that the confirmation field matches the original.
 */
export function validatePasswordMatch(password, confirm) {
  if (!confirm)
    return { valid: false, message: "Please confirm your password" };
  if (password !== confirm)
    return { valid: false, message: "Passwords do not match" };
  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Currency / Amounts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateAmount
 * Checks that a value is a positive number within optional bounds.
 *
 * @param {*}      value
 * @param {object} [opts]
 * @param {number}   [opts.min]       Minimum value (default 1)
 * @param {number}   [opts.max]       Maximum value
 * @param {string}   [opts.fieldName]
 */
export function validateAmount(value, opts = {}) {
  const { min = 1, max, fieldName = "Amount" } = opts;
  const num = Number(value);

  if (!value && value !== 0)
    return { valid: false, message: `${fieldName} is required` };
  if (isNaN(num))
    return { valid: false, message: `${fieldName} must be a number` };
  if (num < min)
    return { valid: false, message: `${fieldName} must be at least ${min}` };
  if (max !== undefined && num > max) {
    return { valid: false, message: `${fieldName} cannot exceed ${max}` };
  }

  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateDate
 * Ensures a value is a valid date string and optionally within a range.
 *
 * @param {string} value      ISO date string
 * @param {object} [opts]
 * @param {string}   [opts.minDate]   ISO date — must be on or after this
 * @param {string}   [opts.maxDate]   ISO date — must be on or before this
 * @param {boolean}  [opts.futureOnly] Must be today or later
 * @param {string}   [opts.fieldName]
 */
export function validateDate(value, opts = {}) {
  const { minDate, maxDate, futureOnly = false, fieldName = "Date" } = opts;

  if (!value) return { valid: false, message: `${fieldName} is required` };

  const date = new Date(value);
  if (isNaN(date.getTime()))
    return { valid: false, message: `${fieldName} is not a valid date` };

  if (futureOnly) {
    const today = new Date().toISOString().slice(0, 10);
    if (value < today) {
      return {
        valid: false,
        message: `${fieldName} must be today or a future date`,
      };
    }
  }

  if (minDate && value < minDate) {
    return {
      valid: false,
      message: `${fieldName} cannot be before ${minDate}`,
    };
  }

  if (maxDate && value > maxDate) {
    return { valid: false, message: `${fieldName} cannot be after ${maxDate}` };
  }

  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// File uploads
// ─────────────────────────────────────────────────────────────────────────────

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/**
 * validateImageFile
 * Checks that a File is an accepted image format and within the size limit.
 *
 * @param {File}   file
 * @param {object} [opts]
 * @param {number}   [opts.maxMB]   Default 5 MB
 */
export function validateImageFile(file, opts = {}) {
  const { maxMB = 5 } = opts;
  if (!file) return { valid: false, message: "Please select a file" };

  if (!IMAGE_TYPES.includes(file.type)) {
    return { valid: false, message: "File must be JPEG, PNG, WebP, or GIF" };
  }

  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, message: `File must be smaller than ${maxMB} MB` };
  }

  return { valid: true, message: null };
}

/**
 * validateDocumentFile
 * Checks that a file is an accepted document type (PDF, JPEG, PNG).
 *
 * @param {File}   file
 * @param {object} [opts]
 * @param {number}   [opts.maxMB]   Default 10 MB
 */
export function validateDocumentFile(file, opts = {}) {
  const { maxMB = 10 } = opts;
  if (!file) return { valid: false, message: "Please select a file" };

  if (!DOC_TYPES.includes(file.type)) {
    return { valid: false, message: "File must be PDF, JPEG, or PNG" };
  }

  const maxBytes = maxMB * 1024 * 1024;
  if (file.size > maxBytes) {
    return { valid: false, message: `File must be smaller than ${maxMB} MB` };
  }

  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Text / name fields
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateFullName
 * Must have at least a first and last name.
 */
export function validateFullName(name) {
  if (!name || !name.trim()) {
    return { valid: false, message: "Full name is required" };
  }
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) {
    return {
      valid: false,
      message: "Please enter your full name (first and last)",
    };
  }
  if (name.trim().length < 4) {
    return { valid: false, message: "Name is too short" };
  }
  return { valid: true, message: null };
}

/**
 * validateSlug
 * URL-safe slug: lowercase, alphanumeric, hyphens only, no leading/trailing hyphen.
 */
export function validateSlug(slug) {
  if (!slug) return { valid: false, message: "Slug is required" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return {
      valid: false,
      message: "Slug must be lowercase letters, numbers, and hyphens only",
    };
  }
  if (slug.length < 3)
    return { valid: false, message: "Slug must be at least 3 characters" };
  if (slug.length > 60)
    return { valid: false, message: "Slug must be at most 60 characters" };
  return { valid: true, message: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite form validators
// Call these to validate an entire form object at once.
// Returns { isValid: boolean, errors: { [field]: string } }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateSignUpForm
 * @param {{ email, password, fullName, phone }} values
 */
export function validateSignUpForm(values) {
  const errors = {};

  const emailRes = validateEmail(values.email);
  if (!emailRes.valid) errors.email = emailRes.message;

  const passRes = validatePassword(values.password);
  if (!passRes.valid) errors.password = passRes.message;

  const nameRes = validateFullName(values.fullName);
  if (!nameRes.valid) errors.fullName = nameRes.message;

  if (values.phone) {
    const phoneRes = validateKEPhone(values.phone);
    if (!phoneRes.valid) errors.phone = phoneRes.message;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validateLoginForm
 * @param {{ email, password }} values
 */
export function validateLoginForm(values) {
  const errors = {};

  const emailRes = validateEmail(values.email);
  if (!emailRes.valid) errors.email = emailRes.message;

  if (!values.password || !values.password.trim()) {
    errors.password = "Password is required";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validateRoomForm
 * @param {{ roomNumber, monthlyPrice, capacity, status }} values
 */
export function validateRoomForm(values) {
  const errors = {};

  if (!values.roomNumber || !values.roomNumber.trim()) {
    errors.roomNumber = "Room number is required";
  }

  const priceRes = validateAmount(values.monthlyPrice, {
    fieldName: "Monthly price",
  });
  if (!priceRes.valid) errors.monthlyPrice = priceRes.message;

  const capRes = validateAmount(values.capacity, {
    min: 1,
    max: 50,
    fieldName: "Capacity",
  });
  if (!capRes.valid) errors.capacity = capRes.message;

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validatePaymentForm
 * @param {{ amount, method, phone? }} values
 */
export function validatePaymentForm(values) {
  const errors = {};

  const amtRes = validateAmount(values.amount, { fieldName: "Payment amount" });
  if (!amtRes.valid) errors.amount = amtRes.message;

  if (!values.method) errors.method = "Payment method is required";

  if (values.method === "mpesa" && values.phone) {
    const phoneRes = validateKEPhone(values.phone);
    if (!phoneRes.valid) errors.phone = phoneRes.message;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * validateComplaintForm
 * @param {{ title, description, category }} values
 */
export function validateComplaintForm(values) {
  const errors = {};

  if (!values.title || !values.title.trim()) {
    errors.title = "Complaint title is required";
  } else if (values.title.trim().length < 5) {
    errors.title = "Title is too short";
  }

  if (!values.description || !values.description.trim()) {
    errors.description = "Please describe your complaint";
  } else if (values.description.trim().length < 20) {
    errors.description = "Description must be at least 20 characters";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// React Hook Form compatible rule objects
// Pass these directly to register() as the second argument:
//   <input {...register("email", emailRules)} />
// ─────────────────────────────────────────────────────────────────────────────
export const emailRules = {
  required: "Email address is required",
  validate: (v) => {
    const msg = validateEmail(v).message;
    return msg ? msg : true;
  },
};

export const passwordRules = {
  required: "Password is required",
  validate: (v) => {
    const msg = validatePassword(v).message;
    return msg ? msg : true;
  },
};

export const phoneRules = {
  validate: (v) => {
    if (!v) return true;
    const msg = validateKEPhone(v).message;
    return msg ? msg : true;
  },
};

export const requiredRule = (fieldName) => ({
  required: `${fieldName != null ? fieldName : "This field"} is required`,
});

export const amountRules = (opts = {}) => ({
  required: "Amount is required",
  validate: (v) => {
    const msg = validateAmount(v, opts).message;
    return msg ? msg : true;
  },
});
