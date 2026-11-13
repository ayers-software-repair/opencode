import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { ServerAuth } from "@/server/auth"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { withNetworkOptions, resolveNetworkOptions, type NetworkOptions } from "../network"
import { ACPProfile } from "@/acp/profile"

export const AcpCommand = effectCmd<NetworkOptions & { cwd: string; attach?: string }, void>({
  command: "acp",
  describe: "start ACP (Agent Client Protocol) server",
  instance: (args) => args.attach === undefined,
  builder: (yargs) => {
    return withNetworkOptions(yargs)
      .option("cwd", {
        describe: "working directory",
        type: "string",
        default: process.cwd(),
      })
      .option("attach", {
        describe: "connect to an existing product host instead of starting a server",
        type: "string",
      })
  },
  handler: Effect.fn("Cli.acp")(function* (args) {
    const { ACP } = yield* Effect.promise(() => import("@/acp/agent"))
    ACPProfile.mark("cli.acp.handler")
    process.env.OPENCODE_CLIENT = "acp"

    const connection = yield* Effect.gen(function* () {
      if (args.attach !== undefined) {
        const url = URL.canParse(args.attach) ? new URL(args.attach) : undefined
        if (
          !url ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          (url.protocol !== "https:" &&
            !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        ) {
          return yield* fail("--attach requires HTTPS or a loopback HTTP URL without credentials, query, or fragment")
        }
        const token = process.env.OPENCODE_ACP_ATTACH_TOKEN?.trim()
        if (!token) {
          return yield* fail("--attach requires a scoped product-host bearer in OPENCODE_ACP_ATTACH_TOKEN")
        }
        return {
          baseUrl: url.href,
          headers: { Authorization: `Bearer ${token}` },
          fetch: Object.assign(
            (request: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
              fetch(request, { ...init, redirect: "error" }),
            { preconnect: fetch.preconnect },
          ),
        }
      }

      const { Server } = yield* Effect.promise(() => import("@/server/server"))
      const opts = yield* resolveNetworkOptions(args)
      const server = yield* Effect.promise(() => ACPProfile.measure("cli.acp.server.listen", () => Server.listen(opts)))
      return {
        baseUrl: `http://${server.hostname}:${server.port}`,
        headers: ServerAuth.headers(),
      }
    })
    const sdk = createOpencodeClient(connection)

    const input = new WritableStream<Uint8Array>({
      write(chunk) {
        return new Promise<void>((resolve, reject) => {
          process.stdout.write(chunk, (err) => {
            if (err) {
              reject(err)
            } else {
              resolve()
            }
          })
        })
      },
    })
    const output = new ReadableStream<Uint8Array>({
      start(controller) {
        process.stdin.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        process.stdin.on("end", () => controller.close())
        process.stdin.on("error", (err) => controller.error(err))
      },
    })

    const stream = ndJsonStream(input, output)
    const agent = ACP.init({ sdk, attached: args.attach !== undefined })

    new AgentSideConnection((conn) => {
      ACPProfile.mark("cli.acp.connection.create")
      return agent.create(conn)
    }, stream)

    yield* Effect.logInfo("setup connection")
    process.stdin.resume()
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve, reject) => {
          process.stdin.on("end", () => resolve())
          process.stdin.on("error", reject)
        }),
    )
  }),
})
