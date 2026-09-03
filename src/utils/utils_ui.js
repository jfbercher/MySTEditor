// Petit utilitaire de notification Toast
export function showToast(message, type = "success", duration = 2000) {
  // Supprime un éventuel toast déjà présent
  const existingToast = document.getElementById("app-toast");
  if (existingToast) existingToast.remove();

  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.textContent = message;

  // Styles de base intégrés
  Object.assign(toast.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    padding: "10px 18px",
    borderRadius: "6px",
    backgroundColor: type === "error" ? "#e74c3c" : "#ebe344",
    color: "#000000",
    fontWeight: "500",
    fontSize: "14px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
    zIndex: "9999",
    opacity: "0",
    transform: "translateY(10px)",
    transition: "all 0.25s ease-in-out",
  });

  
  document.body.appendChild(toast);

  // Animation d'entrée
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  // Animation de sortie et suppression
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 450);
  }, duration);
}