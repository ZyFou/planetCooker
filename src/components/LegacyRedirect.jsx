import { Navigate, useLocation } from "react-router-dom";

export default function LegacyRedirect({ to }) {
  const location = useLocation();
  const search = location.search ?? "";
  const hash = location.hash ?? "";

  return <Navigate to={`${to}${search}${hash}`} replace />;
}
