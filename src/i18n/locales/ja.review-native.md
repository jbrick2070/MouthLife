# ja translation review

Reviewer model: claude-opus-5-5-high. 12 strings changed. 3 still carry an automatic warning (often harmless, e.g. names).

| English | Before | After |
| --- | --- | --- |
| {0} {1} (no more Ions this hour) • Rub the teeth to polish! | {0} {1} (この1時間はフッそイオンなし) • 歯をこすってピカピカにしましょう！ | {0} {1} (この1時間はもうフッそイオンはもらえません) • 歯をこすってピカピカにしましょう！ |
| {0}, Universal {1}, FDI {2} | {0}, Universal {1}, FDI {2} | {0}、ユニバーサル式 {1}、FDI {2} |
| ✨ Sugar spots polished! Smoothness {0}% | ✨ おさとうのよごれがピカピカです！ つるつる度 {0}% | ✨ おさとうのよごれをみがきとりました！ つるつる度 {0}% |
| 💜 Fluoride Rinse Seal! +{0} F⁻ • Spit out, no water for 30 min! | 💜 フッそリンスのバリア！ +{0} F⁻ • はき出して、30分はお水なしです！ | 💜 フッそリンスのバリア！ +{0} F⁻ • はき出して、30分は水を飲まないでください！ |
| Adaptive Music | 動きに合わせる音楽 | 場面で変わる音楽 |
| Claim +{0} F⁻ Bask | つるつるタイム +{0} F⁻ うけとる | つるつるタイムの +{0} F⁻ をうけとる |
| From ancient stardust to germs on the Skylab space station. | はるか昔の星のかけらから、スカイラブうちゅうステーションのきんまで。 | はるか昔の星のかけらから、スカイラブうちゅうステーションのばいきんまで。 |
| Rub teeth to play notes & polish • Drag sky to turn | 歯をこすって音を鳴らしみがきましょう • 空をドラッグして回せます | 歯をこすって音を鳴らしながらみがきましょう • 空をドラッグして回せます |
| Stays on your device • No tracking • No ads | データはたんまつの中だけ • ついせきなし • 広告なし | データはこのきかいの中だけ • ついせきなし • 広告なし |
| Sweep the brush at 45°, zip floss through tight gaps, and fire Fluoride Surges. Then time your real 2-minute brush at the sink. | 45°でブラシを動かし、せまいすき間にフロスをとおして、フッそサージをうち出しましょう。そのあとは、せんめん台で本当の2分間の歯みがきをはかりましょう。 | ブラシを45°にあてて動かし、せまいすき間にフロスをとおして、フッそサージをうち出しましょう。そのあとは、せんめん台で本当に2分間歯をみがいて、時間をはかりましょう。 |
| The calcium in your teeth was made inside dying stars and spread across space. Special cells in your body built it into enamel, the hardest part of you. | 歯のカルシウムは、終わりをむかえた星の中で作られ、うちゅうに広がりました。体の中の特別なさいぼうが、それを体でいちばんかたいエナメルしつにしたのです。 | 歯のカルシウムは、終わりをむかえた星の中で作られ、うちゅうに広がりました。あなたの体の中の特別なさいぼうが、それをいちばんかたい部分、エナメルしつに作りかえたのです。 |
| Universal | Universal | ユニバーサル |

## Still flagged

- • Miswak {0}s → • Miswak {0}s (left in English)
- Claim +{0} F⁻ Bask → つるつるタイムの +{0} F⁻ をうけとる (much longer than the English)
- Works on iPhone, iPad, Mac and the MouthLife web game. No account needed. → iPhone、iPad、Mac、MouthLifeのウェブゲームで使えます。アカウントは必要ありません。 (English words left: iPhone, iPad)
