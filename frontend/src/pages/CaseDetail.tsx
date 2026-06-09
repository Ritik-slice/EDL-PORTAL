import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * CaseDetail just redirects to CAM detail — each case IS a CAM.
 */
export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (id) navigate(`/cases/${id}/cam-detail`, { replace: true });
  }, [id, navigate]);

  return <div className="p-8 text-gray-400">Redirecting to CAM...</div>;
}
