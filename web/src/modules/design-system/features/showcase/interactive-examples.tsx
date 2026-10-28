"use client";

import { ButtonExamples } from "../../ui/shared/button-examples";
import { DialogExamples } from "../../ui/shared/dialog-examples";
import { InputExamples } from "../../ui/shared/input-examples";
import { LoadingExample } from "../../ui/shared/loading-example";
import { useButtonExamples } from "../../hooks/useButtonExamples";
import { useDialogExample } from "../../hooks/useDialogExample";
import { useInputExample } from "../../hooks/useInputExample";
import { useLoadingPreview } from "../../hooks/useLoadingPreview";

export function ButtonShowcase() { return <ButtonExamples {...useButtonExamples()} />; }
export function DialogShowcase() { return <DialogExamples {...useDialogExample()} />; }
export function InputShowcase() { return <InputExamples {...useInputExample()} />; }
export function LoadingShowcase() { return <LoadingExample {...useLoadingPreview()} />; }
