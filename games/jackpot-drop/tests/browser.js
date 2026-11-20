(function (JD) {
  'use strict';

  const summary = document.getElementById('summary');
  const body = document.querySelector('tbody');
  const cases = JD.acceptanceCases;
  let passed = 0;
  let index = 0;

  function runNext() {
    const { id, title, run } = cases[index++];
    const expectedValues = [];
    const actualValues = [];
    let pass = true;

    try {
      run((label, expected, actual) => {
        const expectedText = JSON.stringify(expected);
        const actualText = JSON.stringify(actual);
        expectedValues.push(label + '\n' + expectedText);
        actualValues.push(label + '\n' + actualText);
        pass = pass && expectedText === actualText;
      });
    } catch (error) {
      actualValues.push(error.message);
      pass = false;
    }

    if (pass) passed++;
    const row = body.insertRow();
    row.className = pass ? 'pass' : 'fail';
    for (const value of [id + ' ' + title, expectedValues.join('\n\n'), actualValues.join('\n\n'), pass ? '통과' : '실패']) {
      row.insertCell().textContent = value;
    }
    summary.textContent = 'PASS ' + passed + ' / ' + cases.length;
    if (index < cases.length) setTimeout(runNext, 0);
  }

  setTimeout(runNext, 0);
})(window.JD);
