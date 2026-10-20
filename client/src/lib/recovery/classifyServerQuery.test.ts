import { describe, expect, it } from "vitest";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { classifyServerQuery, isUnauthorizedError } from "./classifyServerQuery";

describe("classifyServerQuery", () => {
  it("keeps a restored screen when a later refetch fails", () => {
    expect(
      classifyServerQuery({ pending: false, error: new Error("down"), hasData: true })
    ).toEqual({ kind: "ready" });
  });

  it("shows loading before any saved data arrives", () => {
    expect(classifyServerQuery({ pending: true, error: null, hasData: false })).toEqual({
      kind: "loading",
    });
  });

  it("asks the user to sign in when the session is gone", () => {
    const error = { data: { code: "UNAUTHORIZED", httpStatus: 401 }, message: "Please sign in." };
    expect(isUnauthorizedError(error)).toBe(true);
    expect(isUnauthorizedError({ message: UNAUTHED_ERR_MSG })).toBe(true);
    expect(classifyServerQuery({ pending: false, error, hasData: false })).toEqual({
      kind: "unauthorized",
    });
  });

  it("offers retry for any other failure with nothing to show", () => {
    expect(
      classifyServerQuery({ pending: false, error: new Error("database"), hasData: false })
    ).toEqual({ kind: "error" });
  });

  it("is ready when the request finished with no error", () => {
    expect(classifyServerQuery({ pending: false, error: null, hasData: false })).toEqual({
      kind: "ready",
    });
  });

  it("turns a wait that passed the bound into retry when nothing is on screen", () => {
    expect(
      classifyServerQuery({ pending: true, error: null, hasData: false, timedOut: true })
    ).toEqual({ kind: "error" });
    expect(
      classifyServerQuery({ pending: true, error: null, hasData: true, timedOut: true })
    ).toEqual({ kind: "ready" });
  });
});
