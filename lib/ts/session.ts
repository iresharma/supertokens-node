import { AuthError, generateError } from "./error";
import { HandshakeInfo } from "./handshakeInfo";
import { Querier } from "./querier";
import { TypeInput } from "./types";

export { AuthError as Error } from "./error";
/**
 * @description: to be called by user of the library. This initiates all the modules necessary for this library to work.
 * Please create a database in your mysql instance before calling this function
 * @throws AuthError GENERAL_ERROR in case anything fails.
 */
export function init(hosts: TypeInput) {
    Querier.initInstance(hosts);
    HandshakeInfo.getInstance().catch(err => {
        // ignored
    });
}

/**
 * @description call this to "login" a user.
 * @throws GENERAL_ERROR in case anything fails.
 */
export async function createNewSession(
    userId: string,
    jwtPayload?: any,
    sessionData?: any
): Promise<{
    session: {
        handle: string;
        userId: string;
        jwtPayload: any;
    };
    accessToken: {
        token: string;
        expiry: number;
        createdTime: number;
        cookiePath: string;
        cookieSecure: boolean;
        domain: string;
    };
    refreshToken: {
        token: string;
        expiry: number;
        createdTime: number;
        cookiePath: string;
        cookieSecure: boolean;
        domain: string;
    };
    idRefreshToken: {
        token: string;
        expiry: number;
        createdTime: number;
    };
    antiCsrfToken: string | undefined;
}> {
    let response = await Querier.getInstance().sendPostRequest("/session", {
        userId,
        userDataInJWT: jwtPayload,
        userDataInDatabase: sessionData
    });
    let instance = await HandshakeInfo.getInstance();
    instance.updateJwtSigningPublicKey(response.jwtSigningPublicKey);
    delete response.status;
    delete response.jwtSigningPublicKey;
    return response;
}

/**
 * @description authenticates a session. To be used in APIs that require authentication
 * @throws AuthError, GENERAL_ERROR, UNAUTHORISED and TRY_REFRESH_TOKEN
 */
export async function getSession(
    accessToken: string,
    antiCsrfToken: string | undefined,
    doAntiCsrfCheck: boolean
): Promise<{
    session: {
        handle: string;
        userId: string | number;
        jwtPayload: any;
    };
    accessToken:
        | {
              token: string;
              expiry: number;
              createdTime: number;
              cookiePath: string;
              cookieSecure: boolean;
              domain: string;
          }
        | undefined;
}> {
    let handShakeInfo = await HandshakeInfo.getInstance();

    // TODO: first try to verify here..

    let response = await Querier.getInstance().sendPostRequest("/session/verify", {
        accessToken,
        antiCsrfToken,
        doAntiCsrfCheck
    });
    if (response.status == "OK") {
        let instance = await HandshakeInfo.getInstance();
        instance.updateJwtSigningPublicKey(response.jwtSigningPublicKey);
        delete response.status;
        delete response.jwtSigningPublicKey;
        return response;
    } else if (response.status == "UNAUTHORISED") {
        throw generateError(AuthError.UNAUTHORISED, new Error(response.message));
    } else {
        throw generateError(AuthError.TRY_REFRESH_TOKEN, new Error(response.message));
    }
}

/**
 * @description generates new access and refresh tokens for a given refresh token. Called when client's access token has expired.
 * @sideEffects calls onTokenTheftDetection if token theft is detected.
 * @throws AuthError, GENERAL_ERROR, UNAUTHORISED, TOKEN_THEFT_DETECTED
 */
export async function refreshSession(
    refreshToken: string
): Promise<{
    session: {
        handle: string;
        userId: string | number;
        jwtPayload: any;
    };
    accessToken: {
        token: string;
        expiry: number;
        createdTime: number;
        cookiePath: string;
        cookieSecure: boolean;
        domain: string;
    };
    refreshToken: {
        token: string;
        expiry: number;
        createdTime: number;
        cookiePath: string;
        cookieSecure: boolean;
        domain: string;
    };
    idRefreshToken: {
        token: string;
        expiry: number;
        createdTime: number;
    };
    antiCsrfToken: string | undefined;
}> {
    let response = await Querier.getInstance().sendPostRequest("/session/refresh", {
        refreshToken
    });
    if (response.status == "OK") {
        delete response.status;
        return response;
    } else if (response.status == "UNAUTHORISED") {
        throw generateError(AuthError.UNAUTHORISED, new Error(response.message));
    } else {
        throw generateError(AuthError.TOKEN_THEFT_DETECTED, {
            sessionHandle: response.session.handle,
            userId: response.session.userId
        });
    }
}

/**
 * @description deletes session info of a user from db. This only invalidates the refresh token. Not the access token.
 * Access tokens cannot be immediately invalidated. Unless we add a bloacklisting method. Or changed the private key to sign them.
 * @throws AuthError, GENERAL_ERROR
 */
export async function revokeAllSessionsForUser(userId: string): Promise<number> {
    let response = await Querier.getInstance().sendDeleteRequest("/session", {
        userId
    });
    return response.numberOfSessionsRevoked;
}

/**
 * @description gets all session handles for current user. Please do not call this unless this user is authenticated.
 * @throws AuthError, GENERAL_ERROR
 */
export async function getAllSessionHandlesForUser(userId: string): Promise<string[]> {
    let response = await Querier.getInstance().sendGetRequest("/session/user", {
        userId
    });
    return response.sessionHandles;
}

/**
 * @description call to destroy one session
 * @returns true if session was deleted from db. Else false in case there was nothing to delete
 * @throws AuthError, GENERAL_ERROR
 */
export async function revokeSessionUsingSessionHandle(sessionHandle: string): Promise<boolean> {
    let response = await Querier.getInstance().sendDeleteRequest("/session", {
        sessionHandle
    });
    return response.numberOfSessionsRevoked == 1;
}

/**
 * @description: this function reads from the database every time. It provides no locking mechanism in case other processes are updating session data for this session as well, so please take of that by yourself.
 * @returns session data as provided by the user earlier
 * @throws AuthError GENERAL_ERROR, UNAUTHORISED.
 */
export async function getSessionData(sessionHandle: string): Promise<any> {
    let response = await Querier.getInstance().sendGetRequest("/session/data", {
        sessionHandle
    });
    if (response.status == "OK") {
        return response.userDataInDatabase;
    } else {
        throw generateError(AuthError.UNAUTHORISED, new Error(response.message));
    }
}

/**
 * @description: It provides no locking mechanism in case other processes are updating session data for this session as well.
 * @throws AuthError GENERAL_ERROR, UNAUTHORISED.
 */
export async function updateSessionData(sessionHandle: string, newSessionData: any) {
    let response = await Querier.getInstance().sendPutRequest("/session/data", {
        sessionHandle,
        userDataInDatabase: newSessionData
    });
    if (response.status == "UNAUTHORISED") {
        throw generateError(AuthError.UNAUTHORISED, new Error(response.message));
    }
}
