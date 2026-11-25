export default class ApiError extends Error {
  constructor(code, message, status = 0, retryAfter = '') {
    super(message || code);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}
