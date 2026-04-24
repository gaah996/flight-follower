export async function start(opts: { port?: number } = {}): Promise<void> {
  console.log('flight-follower server (stub) starting', opts);
}

const invokedDirectly = import.meta.url === `file://${process.argv[1]}`;
if (invokedDirectly) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
