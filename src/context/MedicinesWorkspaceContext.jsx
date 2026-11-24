import { useCallback, useState } from "react";
import MedicinesWorkspaceContext from "./MedicinesWorkspace";
export function MedicinesWorkspaceProvider({ children }) {
  const [history, setHistory] = useState([
    { type: "library" },
  ]);

  const current = history[history.length - 1];
  const navigateTo = useCallback((destination) => {
    setHistory((previous) => [...previous, destination]);
  }, []);

  const goBack = useCallback(() => {
    setHistory((previous) =>
      previous.length > 1
        ? previous.slice(0, -1)
        : previous,
    );
  }, []);

  const resetWorkspace = useCallback(() => {
    setHistory([{ type: "library" }]);
  }, []);

  const replaceWorkspace = useCallback((destination) => {
    setHistory([destination]);
  }, []);
  return (
    <MedicinesWorkspaceContext.Provider
  value={{
  history,
  current,
  navigateTo,
  goBack,
  resetWorkspace,
  replaceWorkspace,
}}
    >
      {children}
    </MedicinesWorkspaceContext.Provider>
  );
}
