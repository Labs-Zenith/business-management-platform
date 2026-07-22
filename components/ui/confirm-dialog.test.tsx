import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

function renderDialog(onConfirm: () => void | Promise<void>) {
  return render(
    <ConfirmDialog
      trigger={<Button variant="ghost">Abrir diálogo</Button>}
      title="¿Eliminar este elemento?"
      description="Esta acción no se puede deshacer."
      onConfirm={onConfirm}
    />
  );
}

describe("ConfirmDialog", () => {
  it("opens the modal when the trigger is clicked", async () => {
    const user = userEvent.setup();
    renderDialog(vi.fn());

    await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));

    expect(await screen.findByText("¿Eliminar este elemento?")).toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));
    await user.click(await screen.findByRole("button", { name: "Eliminar" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirm when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    renderDialog(onConfirm);

    await user.click(screen.getByRole("button", { name: "Abrir diálogo" }));
    await user.click(await screen.findByRole("button", { name: "Cancelar" }));

    expect(onConfirm).not.toHaveBeenCalled();
  });
});
