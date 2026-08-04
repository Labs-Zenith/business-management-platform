import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

/**
 * The optional `open`/`onOpenChange`/`error` props added for the row-level
 * delete buttons. The three tests above are the regression guard that the
 * uncontrolled default still works for the two pre-existing consumers.
 */
describe("ConfirmDialog — controlled open + inline error", () => {
  function renderControlled(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
    return render(
      <ConfirmDialog
        trigger={<Button variant="ghost">Abrir diálogo</Button>}
        title="¿Eliminar este elemento?"
        onConfirm={vi.fn()}
        open
        onOpenChange={vi.fn()}
        {...props}
      />
    );
  }

  it("renders the dialog immediately when `open` is true, without clicking the trigger", async () => {
    renderControlled();

    expect(await screen.findByText("¿Eliminar este elemento?")).toBeInTheDocument();
  });

  it("closes when the parent flips `open` to false — how a successful delete dismisses it", async () => {
    const { rerender } = renderControlled();
    expect(await screen.findByText("¿Eliminar este elemento?")).toBeInTheDocument();

    rerender(
      <ConfirmDialog
        trigger={<Button variant="ghost">Abrir diálogo</Button>}
        title="¿Eliminar este elemento?"
        onConfirm={vi.fn()}
        open={false}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("¿Eliminar este elemento?")).not.toBeInTheDocument();
    });
  });

  it("renders `error` as a role=alert inside the dialog, keeping it open", async () => {
    renderControlled({ error: "No se puede eliminar: tiene 3 facturas asociadas." });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se puede eliminar: tiene 3 facturas asociadas.");
    // The dialog stays open so the user can read why it failed.
    expect(screen.getByText("¿Eliminar este elemento?")).toBeInTheDocument();
  });

  it("renders no alert when `error` is null", async () => {
    renderControlled({ error: null });

    await screen.findByText("¿Eliminar este elemento?");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables both buttons while `pending`", async () => {
    renderControlled({ pending: true });

    expect(await screen.findByRole("button", { name: "Eliminar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  });
});

/**
 * `recoveryAction` turns a refusal into a way forward. It replaces the
 * destructive button rather than sitting beside it, because retrying an
 * action the server just refused could only fail again.
 */
describe("ConfirmDialog — recoveryAction", () => {
  const recovery = { label: "Desactivar", onAction: vi.fn() };

  function renderWithRecovery(error: string | null) {
    return render(
      <ConfirmDialog
        trigger={<Button variant="ghost">Abrir diálogo</Button>}
        title="¿Eliminar este elemento?"
        onConfirm={vi.fn()}
        open
        onOpenChange={vi.fn()}
        error={error}
        recoveryAction={recovery}
      />
    );
  }

  it("is hidden while there is no error — the destructive button stays", async () => {
    renderWithRecovery(null);

    expect(await screen.findByRole("button", { name: "Eliminar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  });

  it("replaces the destructive button once an error is shown", async () => {
    renderWithRecovery("No se puede eliminar.");

    expect(await screen.findByRole("button", { name: "Desactivar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  it("invokes onAction when clicked", async () => {
    const user = userEvent.setup();
    recovery.onAction.mockClear();
    renderWithRecovery("No se puede eliminar.");

    await user.click(await screen.findByRole("button", { name: "Desactivar" }));

    expect(recovery.onAction).toHaveBeenCalledTimes(1);
  });

  it("leaves Cancelar available throughout", async () => {
    renderWithRecovery("No se puede eliminar.");

    expect(await screen.findByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });
});
