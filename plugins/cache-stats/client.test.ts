import assert from "node:assert/strict";
import { test } from "node:test";
import { OpenCode } from "@opencode/client";
import { collect } from "./collect.ts";
import { assistant, session } from "./test-helpers.ts";

test("collects through the published V2 client, preserving pagination and authentication", async () => {
  const requests: URL[] = [];
  const client = OpenCode.make({
    baseUrl: "https://remote.example.test",
    headers: { authorization: "Bearer fixture" },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      assert.equal(request.headers.get("authorization"), "Bearer fixture");
      assert.equal(request.method, "GET");
      requests.push(url);
      if (url.pathname === "/api/session/root") {
        return Response.json({ data: session("root") });
      }
      if (url.pathname === "/api/session") {
        return Response.json({ data: [], cursor: {} });
      }
      if (url.pathname === "/api/session/root/message") {
        assert.equal(url.searchParams.get("type"), "assistant");
        if (!url.searchParams.has("cursor")) {
          return Response.json({ data: [assistant("msg_first")], cursor: { next: "next-page" } });
        }
        assert.equal(url.searchParams.get("cursor"), "next-page");
        assert.equal(url.searchParams.has("order"), false);
        return Response.json({ data: [assistant("msg_last")], cursor: {} });
      }
      throw new Error(`Unexpected endpoint: ${url.pathname}`);
    },
  });
  const result = await collect(client, "root", new AbortController().signal);
  assert.equal(result.acc.reqs, 2);
  assert.equal(result.acc.cacheRead, 180);
  assert.equal(requests.length, 4);
  assert.equal(requests.find((url) => url.pathname === "/api/session")?.searchParams.get("parentID"), "root");
});
