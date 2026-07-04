import { createContext, useContext } from "react";

const MobileCreateAppContext = createContext(false);

export function MobileCreateAppProvider({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <MobileCreateAppContext.Provider value={active}>
      {children}
    </MobileCreateAppContext.Provider>
  );
}

export function useMobileCreateAppContext(): boolean {
  return useContext(MobileCreateAppContext);
}
