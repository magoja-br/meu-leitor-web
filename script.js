document.addEventListener('DOMContentLoaded', () => {
    // Cole sua Chave de API do Google Cloud aqui.
    const SUA_CHAVE_API = 'AIzaSyCZncgfC5xGjvezIUled31DKe4xnqVDKDs';

    const cabecalho = document.querySelector('header');
    const fileInput = document.getElementById('file-input');
    const areaLeitura = document.getElementById('conteudo-leitura');
    const vozSelect = document.getElementById('voz-select');
    const velocidadeSlider = document.getElementById('velocidade-slider');
    const velocidadeValor = document.getElementById('velocidade-valor');

    // Variáveis de estado do player de áudio
    let indiceParagrafoAtual = 0;
    let paragrafosDoTexto = [];
    let estadoLeitura = 'parado';
    let audioAtual = null;
    let isAudioPlaying = false; // Controle para evitar múltiplos áudios
    let velocidadeAtual = 1.00; // Padrão
    let vozAtual = 'pt-BR-Chirp3-HD-Algieba'; // Voz padrão masculina

    // Cache de áudio
    const audioCache = new Map();

    // Fallback para voz inválida
    const vozFallback = 'pt-BR-Chirp3-HD-Achird';

    // Eventos principais
    fileInput.addEventListener('change', handleFileSelect);
    areaLeitura.addEventListener('click', iniciarLeituraDePontoEspecifico);
    vozSelect.addEventListener('change', (e) => {
        vozAtual = e.target.value;
        audioCache.clear(); // Limpa o cache ao mudar a voz
    });
    velocidadeSlider.addEventListener('input', (e) => {
        velocidadeAtual = parseFloat(e.target.value);
        velocidadeValor.textContent = velocidadeAtual.toFixed(2);
        audioCache.clear(); // Limpa o cache ao mudar a velocidade
    });

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        areaLeitura.innerHTML = `<p class="aviso">Carregando e processando o arquivo...</p>`;
        
        if (file.name.endsWith('.txt')) {
            handleTxtFile(file);
        } else if (file.name.endsWith('.pdf')) {
            handlePdfFile(file);
        } else if (file.name.endsWith('.docx')) {
            handleDocxFile(file);
        } else {
            areaLeitura.innerHTML = `<p class="aviso">Formato de arquivo não suportado. Por favor, escolha .txt, .pdf ou .docx.</p>`;
        }
    }

    function handleTxtFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            exibirTexto(e.target.result);
        };
        reader.readAsText(file);
    }

    async function handlePdfFile(file) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                let textoCompleto = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    textoCompleto += textContent.items.map(item => item.str).join(' ') + '\n';
                }
                exibirTexto(textoCompleto);
            } catch (error) {
                console.error('Erro ao processar PDF:', error);
                areaLeitura.innerHTML = `<p class="aviso">Ocorreu um erro ao ler o arquivo PDF.</p>`;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function handleDocxFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const result = await mammoth.extractRawText({ arrayBuffer });
                exibirTexto(result.value);
            } catch (error) {
                console.error('Erro ao processar DOCX:', error);
                areaLeitura.innerHTML = `<p class="aviso">Ocorreu um erro ao ler o arquivo DOCX.</p>`;
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function exibirTexto(texto) {
        pararLeitura(true);
        areaLeitura.innerHTML = '';
        audioCache.clear(); // Limpa o cache ao carregar novo texto
        
        const painelControleAntigo = document.getElementById('player-container');
        if (painelControleAntigo) painelControleAntigo.remove();

        const playerHtml = `
            <div id="player-container" class="player-controls">
                <button id="prev-btn" class="player-button" title="Parágrafo Anterior">⏮️</button>
                <button id="play-pause-btn" class="player-button" title="Tocar / Pausar">▶️</button>
                <button id="stop-btn" class="player-button" title="Parar">⏹️</button>
                <button id="next-btn" class="player-button" title="Próximo Parágrafo">⏭️</button>
            </div>`;
        cabecalho.insertAdjacentHTML('beforeend', playerHtml);
        
        document.getElementById('play-pause-btn').addEventListener('click', tocarPausarLeitura);
        document.getElementById('stop-btn').addEventListener('click', () => pararLeitura(true));
        document.getElementById('prev-btn').addEventListener('click', retrocederParagrafo);
        document.getElementById('next-btn').addEventListener('click', avancarParagrafo);

        const paragrafos = texto.split('\n').filter(p => p.trim() !== '');
        paragrafos.forEach(p_texto => {
            const p = document.createElement('p');
            p.className = 'paragrafo';
            p.textContent = p_texto;
            areaLeitura.appendChild(p);
        });
        paragrafosDoTexto = areaLeitura.querySelectorAll('.paragrafo');
        atualizarBotoesNavegacao();
    }

    function atualizarBotoesNavegacao() {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        if (prevBtn && nextBtn) {
            prevBtn.disabled = indiceParagrafoAtual <= 0;
            nextBtn.disabled = indiceParagrafoAtual >= paragrafosDoTexto.length - 1;
        }
    }

    function iniciarLeituraDePontoEspecifico(event) {
        const paragrafoClicado = event.target.closest('.paragrafo');
        if (!paragrafoClicado) return;

        const novoIndice = Array.from(paragrafosDoTexto).indexOf(paragrafoClicado);

        if (novoIndice !== -1) {
            pararLeitura(false);
            indiceParagrafoAtual = novoIndice;
            atualizarBotoesNavegacao();
            tocarPausarLeitura();
        }
    }

    function avancarParagrafo() {
        if (indiceParagrafoAtual < paragrafosDoTexto.length - 1) {
            pararLeitura(false);
            indiceParagrafoAtual++;
            atualizarBotoesNavegacao();
            tocarPausarLeitura();
        }
    }

    function retrocederParagrafo() {
        if (indiceParagrafoAtual > 0) {
            pararLeitura(false);
            indiceParagrafoAtual--;
            atualizarBotoesNavegacao();
            tocarPausarLeitura();
        }
    }
    
    function tocarPausarLeitura() {
        const btn = document.getElementById('play-pause-btn');
        if (estadoLeitura === 'tocando') {
            pausarLeitura();
        } else {
            btn.innerHTML = '⏸️';
            estadoLeitura = 'tocando';
            if (audioAtual && audioAtual.paused && !isAudioPlaying) {
                audioAtual.play();
            } else {
                lerProximoParagrafo();
            }
        }
    }

    function pausarLeitura() {
        if (audioAtual) {
            audioAtual.pause();
            isAudioPlaying = false;
        }
        estadoLeitura = 'pausado';
        document.getElementById('play-pause-btn').innerHTML = '▶️';
    }

    function pararLeitura(resetarIndice = false) {
        if (audioAtual) {
            audioAtual.pause();
            audioAtual.onended = null;
            audioAtual.src = '';
            audioAtual = null;
            isAudioPlaying = false;
        }

        const paragrafoLendo = document.querySelector('.lendo-agora');
        if (paragrafoLendo) {
            paragrafoLendo.classList.remove('lendo-agora');
        }

        estadoLeitura = 'parado';
        const btn = document.getElementById('play-pause-btn');
        if (btn) btn.innerHTML = '▶️';

        if (resetarIndice) {
            indiceParagrafoAtual = 0;
            atualizarBotoesNavegacao();
        }
    }

    function lerProximoParagrafo() {
        // Remove o destaque do parágrafo anterior, se houver
        if (indiceParagrafoAtual > 0 && paragrafosDoTexto[indiceParagrafoAtual - 1]) {
            paragrafosDoTexto[indiceParagrafoAtual - 1].classList.remove('lendo-agora');
        }

        // Verifica se a leitura deve parar (fim do texto ou pausado pelo usuário)
        if (indiceParagrafoAtual >= paragrafosDoTexto.length || estadoLeitura !== 'tocando') {
            pararLeitura(true);
            return;
        }

        const paragrafoAtual = paragrafosDoTexto[indiceParagrafoAtual];
        paragrafoAtual.classList.add('lendo-agora');
        paragrafoAtual.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const texto = paragrafoAtual.textContent;
        
        // Define o que acontece QUANDO O ÁUDIO TERMINAR
        const onAudioEnd = () => {
            isAudioPlaying = false;
            indiceParagrafoAtual++; // Avança para o próximo parágrafo
            atualizarBotoesNavegacao();
            lerProximoParagrafo(); // Chama a função novamente para continuar o ciclo
        };

        tocarAudio(texto, onAudioEnd); // Inicia a leitura do parágrafo atual
    }

    async function tocarAudio(texto, onEndedCallback) {
        if (SUA_CHAVE_API === 'COLE_SUA_CHAVE_AQUI') {
            alert('Por favor, configure sua chave de API no arquivo script.js');
            pararLeitura(true);
            return;
        }

        if (isAudioPlaying) {
            pararLeitura(false); // Garante que qualquer áudio em execução seja interrompido
        }

        // Evita cache para frases curtas terminadas em "?" (potenciais problemas de entonação)
        const cacheKey = `${texto}_${vozAtual}_${velocidadeAtual}`;
        const isQuestion = texto.trim().endsWith('?') && texto.length < 50;
        if (!isQuestion && audioCache.has(cacheKey)) {
            audioAtual = new Audio(audioCache.get(cacheKey));
            audioAtual.onended = onEndedCallback;
            isAudioPlaying = true;
            audioAtual.play();
            return;
        }

        try {
            let vozParaUsar = vozAtual;
            // Fallback se a voz falhar
            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${SUA_CHAVE_API}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: texto },
                    voice: { 
                        languageCode: 'pt-BR', 
                        name: vozParaUsar // Voz selecionada
                    },
                    audioConfig: { 
                        audioEncoding: 'LINEAR16', // Alterado para maior qualidade
                        speakingRate: velocidadeAtual, // Velocidade ajustável
                        pitch: 0.0 // Padrão, ajustável se necessário
                    }
                })
            });
            let data = await response.json();
            
            // Se erro 400 (voz inválida), tenta fallback
            if (response.status === 400 && data.error && data.error.code === 'INVALID_ARGUMENT') {
                console.warn('Voz inválida, usando fallback:', vozAtual);
                vozParaUsar = vozFallback;
                const fallbackResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${SUA_CHAVE_API}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        input: { text: texto },
                        voice: { 
                            languageCode: 'pt-BR', 
                            name: vozParaUsar 
                        },
                        audioConfig: { 
                            audioEncoding: 'LINEAR16', // Alterado para maior qualidade
                            speakingRate: velocidadeAtual,
                            pitch: 0.0
                        }
                    })
                });
                data = await fallbackResponse.json();
            }
            
            if (data.audioContent) {
                const audioSrc = 'data:audio/wav;base64,' + data.audioContent;
                if (!isQuestion) audioCache.set(cacheKey, audioSrc); // Armazena no cache, exceto para perguntas
                audioAtual = new Audio(audioSrc);
                audioAtual.onended = onEndedCallback;
                isAudioPlaying = true;
                audioAtual.play();
            } else {
                console.error('Erro na API do Google:', data);
                alert('Não foi possível gerar o áudio. Tentou fallback para voz padrão.');
                pararLeitura(true);
            }
        } catch (error) {
            console.error('Erro ao chamar a API:', error);
            alert('Ocorreu um erro ao tentar gerar o áudio. Verifique sua conexão ou chave de API.');
            pararLeitura(true);
        }
    }
}); // Fechamento do DOMContentLoaded