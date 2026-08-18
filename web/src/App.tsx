import type React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { DemoPage } from "@/pages/DemoPage";
import { DeepDivePage } from "@/pages/DeepDivePage";

export default function App(): React.JSX.Element {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DemoPage />} />
          <Route path="how-it-works" element={<DeepDivePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
