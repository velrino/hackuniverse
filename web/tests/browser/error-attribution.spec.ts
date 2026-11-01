import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing synthetic server address");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("browser withholds classic cross-origin errors and exposes CORS-enabled errors", async ({ page }) => {
  const scripts = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "application/javascript", "Access-Control-Allow-Origin": "*" });
    response.end('throw new Error("Synthetic cross-origin attribution failure");');
  });
  const scriptOrigin = await listen(scripts);
  const documents = createServer((request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(`<!doctype html><script>
      window.diagnostic = null;
      window.addEventListener("error", function(event) {
        window.diagnostic = { message: event.message, filename: event.filename, hasError: !!event.error };
      });
      </script><script src="${scriptOrigin}/synthetic.js" ${request.url === "/cors" ? 'crossorigin="anonymous"' : ""}></script>`);
  });
  try {
    const documentOrigin = await listen(documents);
    await page.goto(`${documentOrigin}/opaque`);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "diagnostic"))).toEqual({ message: "Script error.", filename: "", hasError: false });
    await page.goto(`${documentOrigin}/cors`);
    await expect.poll(() => page.evaluate(() => Reflect.get(window, "diagnostic"))).toEqual({
      message: "Uncaught Error: Synthetic cross-origin attribution failure", filename: `${scriptOrigin}/synthetic.js`, hasError: true,
    });
  } finally {
    await Promise.all([close(documents), close(scripts)]);
  }
});

test("application scripts request anonymous CORS attribution", async ({ request }) => {
  const response = await request.get("/example?lang=en");
  expect(response.ok()).toBe(true);
  const html = await response.text();
  const scripts = html.match(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/gu) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) expect(script).toMatch(/\bcrossorigin="(?:anonymous)?"/iu);
});
