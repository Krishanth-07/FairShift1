/**
 * @file Client-Side API Transport Wrapper
 *
 * Provides a hardened fetch wrapper enforcing credentials, CSRF headers on mutating requests,
 * JSON serialization, uniform error handling, and session expiration redirects.
 * Strictly avoids any external libraries or CDNs.
 */

/**
 * Executes an HTTP request against the FairShift backend API.
 *
 * @param {string} endpoint - API path (e.g. '/api/records').
 * @param {object} [options={}] - Fetch configuration options.
 * @returns {Promise<any>} Parsed JSON response body.
 */
export async function apiRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {})
  };

  // State-modifying requests require the CSRF protection header
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers['X-Requested-With'] = 'fairshift';
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const fetchOpts = {
    method,
    headers,
    credentials: 'same-origin'
  };

  if (options.body) {
    fetchOpts.body =
      typeof options.body === 'string' || options.body instanceof FormData
        ? options.body
        : JSON.stringify(options.body);
  }

  let res;
  try {
    res = await fetch(endpoint, fetchOpts);
  } catch (netErr) {
    const error = new Error('Network connection failed. Please check your signal.');
    error.isNetworkError = true;
    throw error;
  }

  // Handle 401 Unauthorized: session expiration
  if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
    const errorData = await res.json().catch(() => ({}));
    const error = new Error(errorData.error?.message || 'Session expired. Please log in again.');
    error.status = 401;
    error.code = errorData.error?.code || 'UNAUTHORIZED';
    // Dispatch global event so UI can transition cleanly to login
    window.dispatchEvent(new CustomEvent('fs-unauthorized'));
    throw error;
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    const errorMessage =
      data?.error?.message ||
      (typeof data === 'string' && data ? data : `Request failed with status ${res.status}`);
    const err = new Error(errorMessage);
    err.status = res.status;
    err.code = data?.error?.code || 'API_ERROR';
    err.details = data?.error?.details || null;
    throw err;
  }

  return data;
}

export const api = {
  get: (url, opts) => apiRequest(url, { ...opts, method: 'GET' }),
  post: (url, body, opts) => apiRequest(url, { ...opts, method: 'POST', body }),
  put: (url, body, opts) => apiRequest(url, { ...opts, method: 'PUT', body }),
  patch: (url, body, opts) => apiRequest(url, { ...opts, method: 'PATCH', body }),
  delete: (url, opts) => apiRequest(url, { ...opts, method: 'DELETE' })
};
