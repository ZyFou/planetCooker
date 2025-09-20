import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LegacyRedirect from "../LegacyRedirect.jsx";

function LocationCapture({ onCapture }) {
  const location = useLocation();
  onCapture(location);
  return null;
}

describe("LegacyRedirect", () => {
  it("preserves search and hash segments when redirecting", () => {
    let redirectedLocation;

    render(
      <MemoryRouter initialEntries={["/studio.html?foo=bar#baz"]}>
        <Routes>
          <Route path="/studio.html" element={<LegacyRedirect to="/studio" />} />
          <Route path="/studio" element={<LocationCapture onCapture={(loc) => (redirectedLocation = loc)} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(redirectedLocation).toBeDefined();
    expect(redirectedLocation).toMatchObject({
      pathname: "/studio",
      search: "?foo=bar",
      hash: "#baz",
    });
  });
});
