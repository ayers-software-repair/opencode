import { describe, expect } from "bun:test"
import type { AuthenticateResponse, InitializeResponse } from "@agentclientprotocol/sdk"
import { Effect } from "effect"
import { cliIt } from "../../lib/cli-process"
import { createAcpClient as createJsonRpcAcpClient } from "./acp-test-client"
import { createAcpClient, expectErrorCode, initialize } from "./helpers"

describe("opencode acp initialize/auth subprocess", () => {
  cliIt.live(
    "rejects missing, malformed, and standalone session flags",
    ({ opencode }) =>
      Effect.gen(function* () {
        for (const extraArgs of [
          ["--attach", "http://127.0.0.1:1"],
          ["--attach", "http://127.0.0.1:1", "--session", "invalid"],
          ["--session", "ses_fixture"],
        ]) {
          const child = yield* opencode.acp({ extraArgs, env: { OPENCODE_ACP_ATTACH_TOKEN: "fixture-token" } })
          expect(yield* Effect.promise(() => child.exited).pipe(Effect.timeout("15 seconds"))).toBe(1)
        }
      }),
    60_000,
  )

  cliIt.live(
    "attach initializes without loading invalid local project config",
    ({ opencode }) =>
      Effect.gen(function* () {
        const env = {
          OPENCODE_CONFIG_CONTENT: "{",
          OPENCODE_ACP_ATTACH_TOKEN: "fixture-token",
        }
        const observed = Promise.withResolvers<{ path: string; authorization: string | null }>()
        const host = yield* Effect.acquireRelease(
          Effect.sync(() =>
            Bun.serve({
              hostname: "127.0.0.1",
              port: 0,
              fetch(request) {
                const url = new URL(request.url)
                observed.resolve({ path: url.pathname + url.search, authorization: request.headers.get("authorization") })
                return new Response("", { headers: { "Content-Type": "text/event-stream" } })
              },
            }),
          ),
          (server) => Effect.promise(() => server.stop(true)),
        )
        const attached = yield* opencode.acp({
          env,
          extraArgs: ["--attach", new URL("/workspace/test/opencode", host.url).href, "--session", "ses_fixture"],
        })
        const initialized = yield* initialize(createJsonRpcAcpClient(attached)).pipe(Effect.timeout("15 seconds"))
        expect(initialized.authMethods).toEqual([])
        expect(initialized.agentCapabilities?.sessionCapabilities?.fork).toBeUndefined()
        expect(yield* Effect.promise(() => observed.promise).pipe(Effect.timeout("15 seconds"))).toEqual({
          path: "/workspace/test/opencode/global/event?sessionId=ses_fixture",
          authorization: "Bearer fixture-token",
        })

        const standalone = yield* opencode.acp({ env })
        expect(yield* Effect.promise(() => standalone.exited).pipe(Effect.timeout("15 seconds"))).not.toBe(0)
      }),
    60_000,
  )

  cliIt.live(
    "initialize responds with capabilities",
    ({ opencode }) =>
      Effect.gen(function* () {
        const initialized = yield* initialize(yield* createAcpClient({ opencode }))

        expect(initialized.protocolVersion).toBe(1)
        expect(initialized.agentCapabilities?.promptCapabilities?.embeddedContext).toBe(true)
        expect(initialized.agentCapabilities?.promptCapabilities?.image).toBe(true)
        expect(initialized.agentCapabilities?.mcpCapabilities?.http).toBe(true)
        expect(initialized.agentCapabilities?.mcpCapabilities?.sse).toBe(true)
        expect(initialized.agentCapabilities?.loadSession).toBe(true)
        expect(initialized.agentCapabilities?.sessionCapabilities?.close).toEqual({})
        expect(initialized.agentCapabilities?.sessionCapabilities?.fork).toEqual({})
        expect(initialized.agentCapabilities?.sessionCapabilities?.list).toEqual({})
        expect(initialized.agentCapabilities?.sessionCapabilities?.resume).toEqual({})
        expect(initialized.agentInfo?.name).toBe("OpenCode")
      }),
    60_000,
  )

  cliIt.live(
    "auth negotiation is explicit and safe",
    ({ opencode }) =>
      Effect.gen(function* () {
        const acp = yield* createAcpClient({ opencode })
        const initialized = yield* initialize(acp)

        expect(initialized.authMethods?.[0]?.id).toBe("opencode-login")
        expect(initialized.authMethods?.[0]?._meta?.["terminal-auth"]).toBeDefined()
        expect(yield* acp.request<AuthenticateResponse>("authenticate", { methodId: "opencode-login" })).toMatchObject({
          result: {},
        })

        const rejected = yield* acp.request<AuthenticateResponse>("authenticate", { methodId: "missing-auth-method" })
        expectErrorCode(rejected.error, -32602)
        expect(JSON.stringify(rejected.error)).not.toContain(process.env.OPENCODE_AUTH_CONTENT ?? "not-present")
      }),
    60_000,
  )

  cliIt.live(
    "initialize without terminal-auth metadata keeps auth command implicit",
    ({ opencode }) =>
      Effect.gen(function* () {
        const acp = yield* createAcpClient({ opencode })
        const initialized = yield* acp.request<InitializeResponse>("initialize", { protocolVersion: 1 })

        expect(initialized.result?.authMethods?.[0]?.id).toBe("opencode-login")
        expect(initialized.result?.authMethods?.[0]?._meta?.["terminal-auth"]).toBeUndefined()
      }),
    60_000,
  )
})
