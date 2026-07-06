export function createVoice() {
  const synth = window.speechSynthesis;
  let roVoice = null;

  function pickVoice() {
    const voices = synth ? synth.getVoices() : [];
    roVoice = voices.find(v => v.lang?.toLowerCase().startsWith('ro')) || null;
  }

  if (synth) {
    pickVoice();
    synth.onvoiceschanged = pickVoice;
  }

  function speak(text) {
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(text);
    if (roVoice) {
      utterance.voice = roVoice;
      utterance.lang = 'ro-RO';
    }
    utterance.rate = 1.1;
    synth.cancel();
    synth.speak(utterance);
  }

  return {
    enabled: !!synth,
    say(text) {
      speak(text);
    },
    count(n) {
      speak(String(n));
    },
  };
}
