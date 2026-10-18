document.querySelectorAll('[data-copy]').forEach(button=>{
  button.addEventListener('click',async()=>{
    const text=document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      document.getElementById('copy-status').textContent='프롬프트를 복사했어요.';
      button.textContent='복사 완료 ✓';
    } catch {
      const range=document.createRange();range.selectNodeContents(document.getElementById(button.dataset.copy));
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
      document.getElementById('copy-status').textContent='자동 복사가 제한되어 내용을 선택했어요. 직접 복사해주세요.';
    }
  });
});
