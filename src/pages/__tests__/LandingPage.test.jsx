import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LandingPage from "../LandingPage.jsx";

describe("LandingPage", () => {
  beforeEach(() => {
    vi.spyOn(window, "fetch").mockImplementation((url) => {
      if (String(url).includes("/stats/count")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ total: 123 })
        });
      }

      if (String(url).includes("/recent")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              items: [
                {
                  id: "ABC123",
                  createdAt: Date.now(),
                  summary: { seed: "42", preset: "Nebula" }
                }
              ]
            })
        });
      }

      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders hero content and loads stats", async () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /craft your own worlds/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("123", { selector: "dd" })).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /load in studio/i })).toBeInTheDocument();
    });
  });
});
