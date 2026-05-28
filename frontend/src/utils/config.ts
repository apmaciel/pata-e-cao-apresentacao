const API_URL: string =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_API_URL
    ? (import.meta as any).env.PUBLIC_API_URL
    : 'http://localhost:8080';

export { API_URL };
