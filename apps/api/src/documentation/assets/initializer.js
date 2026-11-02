/* Swagger UI real, sem validador externo, CDN, tokens predefinidos ou persistência. */
window.ui = window.SwaggerUIBundle({
  dom_id: '#swagger-ui',
  url: '/api-docs/openapi.json',
  validatorUrl: null,
  queryConfigEnabled: false,
  persistAuthorization: false,
  deepLinking: true,
  displayRequestDuration: true,
  supportedSubmitMethods: ['get', 'post', 'put', 'patch', 'delete'],
  requestInterceptor(request) {
    const url = new URL(request.url, window.location.href);
    if (
      url.origin !== window.location.origin ||
      !(url.pathname.startsWith('/api/') || url.pathname === '/api-docs/openapi.json')
    )
      throw Error('A documentação só pode consultar esta API.');
    request.credentials = 'omit';
    return request;
  },
});
