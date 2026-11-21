export default defineEventHandler({
  onRequest: [defineRequestMiddleware(() => {})],
  handler: () => 'host h3',
});
