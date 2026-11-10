import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NativeRequestError } from "./NativeRequestError";

it("offers a retry and prevents duplicate requests while recovery is pending", () => {
  const retry = vi.fn();
  const app = render(<NativeRequestError label="Couldn’t load sessions" retry={retry} loading={false} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load sessions");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
  app.rerender(<NativeRequestError label="Couldn’t load sessions" retry={retry} loading />);
  const button = screen.getByRole("button", { name: "Try again" });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(retry).toHaveBeenCalledOnce();
});
