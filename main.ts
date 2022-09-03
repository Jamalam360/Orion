import { Hono } from "https://deno.land/x/hono@v2.1.3/mod.ts";
import {
  bearerAuth,
  logger,
} from "https://deno.land/x/hono@v2.1.3/middleware.ts";
import { walk } from "https://deno.land/std@v0.154.0/fs/mod.ts";

const ssl: Record<string, string> = {};

if (Deno.env.get("ORION_SSL_KEY") && Deno.env.get("ORION_SSL_CERT")) {
  ssl.key = await Deno.readTextFile(Deno.env.get("ORION_SSL_KEY")!);
  ssl.cert = await Deno.readTextFile(Deno.env.get("ORION_SSL_CERT")!);
}

const token = Deno.env.get("ORION_TOKEN")!;

async function dockerRestart(container: string) {
  await Deno.spawn("docker", { args: ["restart", container] });
}

const app = new Hono();

app.use("*", logger());
app.use("/deploy/*", bearerAuth({ token }));
app.get("/", (c) => c.text("Hello World!"));
app.get("/ping", (c) => c.text("Pong!"));

app.post("/deploy/pack", async (c) => {
  await Deno.spawn("git", { args: ["pull"], cwd: "/content/pack" });

  for await (const file of walk("/content/pack")) {
    for (
      const path of [
        "/.github",
        "/.vscode",
        "/bot",
        "/datapack",
        "/.gitattributes",
        "/.gitignore",
        "/categories.json",
      ]
    ) {
      if (file.path.endsWith(path)) {
        await Deno.remove(file.path);
      }
    }
  }

  await dockerRestart("nginx");
  c.json({ message: "Successfully updated pack" });
});

await Deno.serve({
  ...ssl,
  port: parseInt(Deno.env.get("ORION_PORT") ?? "8080"),
  onListen: ({ hostname, port }) =>
    console.log(`Orion API listening on ${hostname}:${port}`),
  onError: (e) => {
    console.error("Orion API encountered an error:", e);
    return new Response("Internal Server Error", { status: 500 });
  },
}, app.fetch);
