import type { AuthRequest, OAuthHelpers } from '@cloudflare/workers-oauth-provider'
import { Hono } from 'hono'
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from './utils.js'
const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>()

/**
 * OAuth Authorization Endpoint
 *
 * This route initiates the Todoist OAuth flow when a user wants to log in.
 * It creates a random state parameter to prevent CSRF attacks and stores the
 * original OAuth request information in KV storage for later retrieval.
 * Then it redirects the user to Todoist's authorization page with the appropriate
 * parameters so the user can authenticate and grant permissions.
 */
app.get('/authorize', async (c) => {
    const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw)
    if (!oauthReqInfo.clientId) {
        return c.text('Invalid request', 400)
    }

    return Response.redirect(
        getUpstreamAuthorizeUrl({
            upstream_url: 'https://todoist.com/oauth/authorize',
            scope: 'data:read',
            client_id: c.env.TODOIST_CLIENT_ID,
            redirect_uri: new URL('/callback', c.req.url).href,
            state: btoa(JSON.stringify(oauthReqInfo)),
        })
    )
})

/**
 * OAuth Callback Endpoint
 *
 * This route handles the callback from Todoist after user authentication.
 * It exchanges the temporary code for an access token, then stores some
 * user metadata & the auth token as part of the 'props' on the token passed
 * down to the client. It ends by redirecting the client back to _its_ callback URL
 */
app.get('/callback', async (c) => {
    // Get the oathReqInfo out of KV
    const oauthReqInfo = JSON.parse(atob(c.req.query('state') as string)) as AuthRequest
    if (!oauthReqInfo.clientId) {
        return c.text('Invalid state', 400)
    }

    // Exchange the code for an access token
    const [accessToken, errResponse] = await fetchUpstreamAuthToken({
        upstream_url: 'https://todoist.com/oauth/access_token',
        client_id: c.env.TODOIST_CLIENT_ID,
        client_secret: c.env.TODOIST_CLIENT_SECRET,
        code: c.req.query('code'),
        redirect_uri: new URL('/callback', c.req.url).href,
    })
    if (errResponse) return errResponse

    const response = await getUserInfo(accessToken)

    if (!response.ok) {
        return response
    }

    const data = (await response.json()) as { user: { full_name: string; email: string } }
    const { full_name, email } = data.user

    // Return back to the MCP client a new token
    const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthReqInfo,
        userId: email,
        metadata: {
            label: full_name,
        },
        scope: oauthReqInfo.scope,
        // This will be available on this.props inside TodoistMCP
        props: {
            full_name,
            email,
            accessToken,
        },
    })

    return Response.redirect(redirectTo)
})

// Use Todoist sync API to get user info
async function getUserInfo(accessToken: string) {
    return await fetch('https://api.todoist.com/sync/v9/sync', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            sync_token: '*',
            resource_types: '["user"]',
        }),
    })
}

export const TodoistAuthHandler = app
