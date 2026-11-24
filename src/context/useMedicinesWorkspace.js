import { useContext } from "react";
import MedicinesWorkspaceContext from "./MedicinesWorkspace";

export function useMedicinesWorkspace() {
  const context = useContext(MedicinesWorkspaceContext);

  if (!context) {
    throw new Error(
      "useMedicinesWorkspace must be used within MedicinesWorkspaceProvider",
    );
  }

  return context;
}