function renderIntro() {
  topbar.style.display = "none";
  app.innerHTML = `
    <div class="center" style="margin-bottom:20px;">
      <img src="/logo.png" alt="italica" style="height:56px;width:auto;margin:0 auto;display:block;" />
    </div>
    <h1>${content.title}</h1>
    <p class="muted"><strong>Durata totale: ${content.totalMinutes} minuti</strong></p>
    <p>Ciao ciao!</p>
    <p>${esc(content.intro.firstParagraphUk)}</p>
    ${content.intro.bodyIt.map((p) => `<p>${esc(p)}</p>`).join("")}
    <h2 style="font-size:18px;">${esc(content.intro.howItWorksTitle)}</h2>
    ${content.intro.howItWorks.map((p) => `<p><em>${esc(p)}</em></p>`).join("")}
    <h2 style="font-size:18px;">${esc(content.intro.beforeStartTitle)}</h2>
    <div class="notice">
      <ul class="plain">
        ${content.intro.beforeStart.map((li) => `<li>${esc(li)}</li>`).join("")}
      </ul>
    </div>
    <p>${esc(content.intro.closing)}</p>
    <p><em>${esc(content.intro.signOff)}</em></p>
    <div class="field">
      <label for="studentName">Nome e cognome</label>
      <input type="text" id="studentName" placeholder="Es. Maria Rossi" value="${esc(state.studentName)}" />
    </div>
    <button class="btn" id="startBtn" disabled>Inizia il test</button>
  `;
  const input = document.getElementById("studentName");
  const btn = document.getElementById("startBtn");
  function refresh() { btn.disabled = !input.value.trim(); }
  input.addEventListener("input", refresh);
  refresh();
  btn.addEventListener("click", () => {
    state.studentName = input.value.trim();
    state.startedAt = Date.now();
    state.screen = "quiz";
    state.currentPart = 0;
    saveLocal();
    topbar.style.display = "flex";
    startTimer();
    renderPart();
  });
}
