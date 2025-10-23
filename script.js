document.addEventListener('DOMContentLoaded', () => {
    // Cole sua Chave de API do Google Cloud aqui.
    const SUA_CHAVE_API = 'AIzaSyCZncgfC5xGjvezIUled31DKe4xnqVDKDs';

    const cabecalho = document.querySelector('header');
    const fileInput = document.getElementById('file-input');
    const areaLeitura = document.getElementById('conteudo-leitura');
    const vozSelect = document.getElementById('voz-select');
    const velocidadeSlider = document.getElementById('velocidade-slider');
    const velocidadeValor = document.getElementById('velocidade-valor');
    const voltarBtn = document.getElementById('voltar-btn');

    // Variáveis de estado do player de áudio
    let indiceParagrafoAtual = 0;
    let paragrafosDoTexto = [];
    let estadoLeitura = 'parado';
    let audioAtual = null;
    let isAudioPlaying = false;
    let isProcessingAudio = false;
    let velocidadeAtual = 1.00;
    let vozAtual = 'pt-BR-Neural2-B';
    let vozesDisponiveis = [];

    // Cache de áudio
    const audioCache = new Map();

    // Fallback para voz inválida
    const vozFallback = 'pt-BR-Neural2-B';

    // Função para sanitizar texto
    function sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        return text.replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove emojis
                   .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '') // Mantém letras, números, pontuação e espaços
                   .trim()
                   .substring(0, 5000); // Limita a 5000 caracteres
    }

    // Função para carregar vozes disponíveis
    async function carregarVozesDisponiveis() {
        try {
            const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${SUA_CHAVE_API}`);
            const data = await response.json();
            if (data.voices) {
                vozesDisponiveis = data.voices
                    .filter(voice => voice.languageCodes.includes('pt-BR') && (voice.name.includes('Neural2') || voice.name.includes('Wavenet')))
                    .map(voice => ({
                        name: voice.name,
                        gender: voice.ssmlGender || 'UNKNOWN'
                    }));
                console.log('Vozes disponíveis para pt-BR:', vozesDisponiveis.map(v => v.name));

                // Preenche o dropdown com vozes disponíveis
                vozSelect.innerHTML = '';
                vozesDisponiveis.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.gender === 'MALE' ? 'Masculina' : voice.gender === 'FEMALE' ? 'Feminina' : 'Neutro'})`;
                    vozSelect.appendChild(option);
                });

                // Define a voz padrão
                if (!vozesDisponiveis.some(voice => voice.name === vozAtual)) {
                    console.warn(`Voz ${vozAtual} não suportada, usando fallback: ${vozFallback}`);
                    vozAtual = vozFallback;
                    vozSelect.value = vozFallback;
                } else {
                    vozSelect.value = vozAtual;
                }
            } else {
                console.warn('Nenhuma voz retornada pela API, usando vozes padrão.');
                // Fallback para vozes conhecidas
                const vozesPadrao = [
                    { name: 'pt-BR-Neural2-B', gender: 'MALE' },
                    { name: 'pt-BR-Neural2-D', gender: 'MALE' },
                    { name: 'pt-BR-Neural2-A', gender: 'FEMALE' },
                    { name: 'pt-BR-Neural2-C', gender: 'FEMALE' }
                ];
                vozesDisponiveis = vozesPadrao;
                vozSelect.innerHTML = '';
                vozesPadrao.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.gender === 'MALE' ? 'Masculina' : 'Feminina'})`;
                    vozSelect.appendChild(option);
                });
                vozAtual = vozFallback;
                vozSelect.value = vozFallback;
            }
        } catch (error) {
            console.error('Erro ao carregar vozes disponíveis:', error);
            alert('Não foi possível carregar as vozes disponíveis. Usando vozes padrão.');
            // Fallback para vozes conhecidas
            const vozesPadrao = [
                { name: 'pt-BR-Neural2-B', gender: 'MALE' },
                { name: 'pt-BR-Neural2-D', gender: 'MALE' },
                { name: 'pt-BR-Neural2-A', gender: 'FEMALE' },
                { name: 'pt-BR-Neural2-C', gender: 'FEMALE' }
            ];
            vozesDisponiveis = vozesPadrao;
            vozSelect.innerHTML = '';
            vozesPadrao.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.gender === 'MALE' ? 'Masculina' : 'Feminina'})`;
                vozSelect.appendChild(option);
            });
            vozAtual = vozFallback;
            vozSelect.value = vozFallback;
        }
    }

    // Função para desabilitar/habilitar botões durante transições
    function toggleButtons(disabled) {
        const buttons = [
            document.getElementById('play-pause-btn'),
            document.getElementById('stop-btn'),
            document.getElementById('prev-btn'),
            document.getElementById('next-btn'),
            voltarBtn
        ];
        buttons.forEach(btn => {
            if (btn) btn.disabled = disabled;
        });
    }

    // Função de debounce para eventos de clique
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Carrega vozes disponíveis ao iniciar
    carregarVozesDisponiveis();

    // Eventos principais
    fileInput.addEventListener('change', handleFileSelect);
    areaLeitura.addEventListener('click', debounce(iniciarLeituraDePontoEspecifico, 200));
    vozSelect.addEventListener('change', (e) => {
        const novaVoz = e.target.value;
        if (!vozesDisponiveis.some(voice => voice.name === novaVoz)) {
            console.warn(`Voz ${novaVoz} não suportada, usando fallback: ${vozFallback}`);
            vozAtual = vozFallback;
            e.target.value = vozFallback;
        } else {
            vozAtual = novaVoz;
        }
        audioCache.clear();
        pararLeitura(false);
        console.log(`Voz alterada para: ${vozAtual}`);
        // Adiciona classe temporária para feedback visual
        vozSelect.classList.add('changed');
        setTimeout(() => vozSelect.classList.remove('changed'), 1000);
        // Retoma a leitura do parágrafo atual
        if (estadoLeitura === 'tocando' || estadoLeitura === 'pausado') {
            tocarPausarLeitura();
        }
    });
    velocidadeSlider.addEventListener('input', (e) => {
        velocidadeAtual = parseFloat(e.target.value);
        velocidadeValor.textContent = velocidadeAtual.toFixed(2);
        audioCache.clear();
        console.log(`Velocidade alterada para: ${velocidadeAtual}`);
    });
    voltarBtn.addEventListener('click', debounce(() => {
        if (isProcessingAudio) return;
        pausarLeitura();
        cabecalho.classList.remove('hidden');
        voltarBtn.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
        console.log(`Botão VOLTAR clicado, índice mantido: ${indiceParagrafoAtual}`);
    }, 200));

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
        } else if (file.name.endsWith('.xlsx')) {
            handleXlsxFile(file);
        } else {
            areaLeitura.innerHTML = `<p class="aviso">Formato de arquivo não suportado. Por favor, escolha .txt, .pdf, .docx ou .xlsx.</p>`;
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

    async function handleXlsxFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                gk_isXlsx = true;
                gk_xlsxFileLookup[file.name] = true;
                gk_fileData[file.name] = e.target.result.split(',')[1];
                const csvText = loadFileData(file.name);
                if (csvText) {
                    const lines = csvText.split('\n').filter(line => line.trim() !== '');
                    const texto = lines.join('\n');
                    exibirTexto(texto);
                } else {
                    throw new Error('Falha ao processar o arquivo XLSX');
                }
            } catch (error) {
                console.error('Erro ao processar XLSX:', error);
                areaLeitura.innerHTML = `<p class="aviso">Ocorreu um erro ao ler o arquivo XLSX.</p>`;
            } finally {
                gk_isXlsx = false;
            }
        };
        reader.readAsDataURL(file);
    }

    function exibirTexto(texto) {
        pararLeitura(true);
        areaLeitura.innerHTML = '';
        audioCache.clear();
        
        const painelControleAntigo = document.getElementById('player-container');
        if (painelControleAntigo) painelControleAntigo.remove();

        const playerHtml = `
            <div id="player-container" class="player-controls">
                <button id="prev-btn" class="player-button" title="Ir para o parágrafo anterior">←</button>
                <button id="play-pause-btn" class="player-button" title="Tocar / Pausar">▶️</button>
                <button id="stop-btn" class="player-button" title="Parar e voltar ao início">⏹️</button>
                <button id="next-btn" class="player-button" title="Ir para o próximo parágrafo">→</button>
            </div>`;
        cabecalho.insertAdjacentHTML('beforeend', playerHtml);
        
        document.getElementById('play-pause-btn').addEventListener('click', debounce(tocarPausarLeitura, 200));
        document.getElementById('stop-btn').addEventListener('click', debounce(() => {
            if (isProcessingAudio) return;
            pararLeitura(true);
            cabecalho.classList.remove('hidden');
            voltarBtn.style.display = 'none';
            window.scrollTo({ top: 0, behavior: 'smooth' });
            console.log('Leitura parada, índice resetado para 0');
        }, 200));
        document.getElementById('prev-btn').addEventListener('click', debounce(retrocederParagrafo, 200));
        document.getElementById('next-btn').addEventListener('click', debounce(avancarParagrafo, 200));

        const paragrafos = texto.split('\n').filter(p => p.trim() !== '');
        paragrafos.forEach(p_texto => {
            const p = document.createElement('p');
            p.className = 'paragrafo';
            p.textContent = p_texto;
            areaLeitura.appendChild(p);
        });
        paragrafosDoTexto = areaLeitura.querySelectorAll('.paragrafo');
        atualizarBotoesNavegacao();
        console.log(`Texto carregado com ${paragrafosDoTexto.length} parágrafos`);
    }

    function atualizarBotoesNavegacao() {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        if (prevBtn && nextBtn) {
            prevBtn.disabled = indiceParagrafoAtual <= 0 || isProcessingAudio;
            nextBtn.disabled = indiceParagrafoAtual >= paragrafosDoTexto.length - 1 || isProcessingAudio;
            console.log(`Botões atualizados: prev=${prevBtn.disabled}, next=${nextBtn.disabled}, indice=${indiceParagrafoAtual}`);
        }
    }

    function iniciarLeituraDePontoEspecifico(event) {
        if (isProcessingAudio) return;
        const paragrafoClicado = event.target.closest('.paragrafo');
        if (!paragrafoClicado) return;

        const novoIndice = Array.from(paragrafosDoTexto).indexOf(paragrafoClicado);
        if (novoIndice !== -1) {
            console.log(`Iniciando leitura no parágrafo ${novoIndice}`);
            pararLeitura(false);
            indiceParagrafoAtual = novoIndice;
            atualizarBotoesNavegacao();
            tocarPausarLeitura();
        }
    }

    function avancarParagrafo() {
        if (isProcessingAudio || indiceParagrafoAtual >= paragrafosDoTexto.length - 1) {
            console.log(`Não pode avançar: isProcessing=${isProcessingAudio}, indice=${indiceParagrafoAtual}, total=${paragrafosDoTexto.length}`);
            return;
        }
        pararLeitura(false);
        indiceParagrafoAtual++;
        atualizarBotoesNavegacao();
        tocarPausarLeitura();
        console.log(`Avançando para parágrafo ${indiceParagrafoAtual}`);
    }

    function retrocederParagrafo() {
        if (isProcessingAudio || indiceParagrafoAtual <= 0) {
            console.log(`Não pode retroceder: isProcessing=${isProcessingAudio}, indice=${indiceParagrafoAtual}`);
            return;
        }
        pararLeitura(false);
        indiceParagrafoAtual--;
        atualizarBotoesNavegacao();
        tocarPausarLeitura();
        console.log(`Retrocedendo para parágrafo ${indiceParagrafoAtual}`);
    }
    
    function tocarPausarLeitura() {
        if (isProcessingAudio) {
            console.log('Bloqueado: áudio em processamento');
            return;
        }
        const btn = document.getElementById('play-pause-btn');
        if (estadoLeitura === 'tocando') {
            console.log('Pausando leitura');
            pausarLeitura();
        } else {
            console.log(`Iniciando leitura no parágrafo ${indiceParagrafoAtual} com voz ${vozAtual}`);
            btn.innerHTML = '⏸️';
            estadoLeitura = 'tocando';
            cabecalho.classList.add('hidden');
            voltarBtn.style.display = 'block';
            toggleButtons(true);
            if (audioAtual && audioAtual.paused && !isAudioPlaying) {
                audioAtual.play().then(() => {
                    isAudioPlaying = true;
                    toggleButtons(false);
                    console.log('Reproduzindo áudio pausado');
                }).catch((error) => {
                    console.error('Erro ao reproduzir áudio:', error);
                    toggleButtons(false);
                    pararLeitura(false);
                });
            } else {
                setTimeout(() => lerProximoParagrafo(), 600);
            }
        }
    }

    function pausarLeitura() {
        if (audioAtual) {
            audioAtual.pause();
            audioAtual.currentTime = 0;
            isAudioPlaying = false;
        }
        estadoLeitura = 'pausado';
        document.getElementById('play-pause-btn').innerHTML = '▶️';
        cabecalho.classList.remove('hidden');
        voltarBtn.style.display = 'none';
        toggleButtons(false);
        console.log(`Leitura pausada, índice mantido: ${indiceParagrafoAtual}`);
    }

    function pararLeitura(resetarIndice = false) {
        if (audioAtual) {
            audioAtual.pause();
            audioAtual.onended = null;
            audioAtual.src = '';
            audioAtual.currentTime = 0;
            audioAtual = null;
            isAudioPlaying = false;
            isProcessingAudio = false;
        }

        const paragrafoLendo = document.querySelector('.lendo-agora');
        if (paragrafoLendo) {
            paragrafoLendo.classList.remove('lendo-agora');
        }

        estadoLeitura = 'parado';
        const btn = document.getElementById('play-pause-btn');
        if (btn) btn.innerHTML = '▶️';
        cabecalho.classList.remove('hidden');
        voltarBtn.style.display = 'none';
        toggleButtons(false);

        if (resetarIndice) {
            indiceParagrafoAtual = 0;
            atualizarBotoesNavegacao();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        console.log(`Leitura parada, resetarIndice=${resetarIndice}, índice=${indiceParagrafoAtual}`);
    }

    function lerProximoParagrafo() {
        if (isProcessingAudio) {
            console.log('Bloqueado: áudio em processamento');
            return;
        }

        if (indiceParagrafoAtual > 0 && paragrafosDoTexto[indiceParagrafoAtual - 1]) {
            paragrafosDoTexto[indiceParagrafoAtual - 1].classList.remove('lendo-agora');
        }

        if (indiceParagrafoAtual >= paragrafosDoTexto.length || estadoLeitura !== 'tocando') {
            console.log('Parando leitura: fim do texto ou pausado');
            pararLeitura(true);
            return;
        }

        const paragrafoAtual = paragrafosDoTexto[indiceParagrafoAtual];
        paragrafoAtual.classList.add('lendo-agora');
        paragrafoAtual.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const texto = sanitizeText(paragrafoAtual.textContent);
        
        if (!texto) {
            console.warn('Parágrafo vazio ou inválido, avançando para o próximo.');
            indiceParagrafoAtual++;
            atualizarBotoesNavegacao();
            setTimeout(() => lerProximoParagrafo(), 600);
            return;
        }

        const onAudioEnd = () => {
            isAudioPlaying = false;
            isProcessingAudio = false;
            indiceParagrafoAtual++;
            atualizarBotoesNavegacao();
            console.log(`Áudio terminado, avançando para parágrafo ${indiceParagrafoAtual}`);
            setTimeout(() => lerProximoParagrafo(), 600);
        };

        console.log(`Iniciando leitura no parágrafo ${indiceParagrafoAtual} com voz ${vozAtual}: "${texto.substring(0, 50)}${texto.length > 50 ? '...' : ''}"`);
        tocarAudio(texto, onAudioEnd);
    }

    async function tocarAudio(texto, onEndedCallback) {
        if (SUA_CHAVE_API === 'SUA_CHAVE_API_AQUI') {
            alert('Por favor, configure uma chave de API válida no arquivo script.js. Acesse https://console.cloud.google.com/ para criar uma.');
            pararLeitura(true);
            return;
        }

        if (isAudioPlaying || isProcessingAudio) {
            console.log('Parando áudio anterior antes de iniciar novo');
            pararLeitura(false);
        }

        isProcessingAudio = true;
        toggleButtons(true);

        const cacheKey = `${texto}_${vozAtual}_${velocidadeAtual}`;
        const isQuestion = texto.endsWith('?') && texto.length < 50;
        if (!isQuestion && audioCache.has(cacheKey)) {
            audioAtual = new Audio(audioCache.get(cacheKey));
            audioAtual.onended = onEndedCallback;
            isAudioPlaying = true;
            audioAtual.play().then(() => {
                isProcessingAudio = false;
                toggleButtons(false);
                console.log('Reproduzindo áudio do cache');
            }).catch((error) => {
                console.error('Erro ao reproduzir áudio do cache:', error);
                isProcessingAudio = false;
                toggleButtons(false);
                pararLeitura(false);
            });
            return;
        }

        try {
            const vozParaUsar = vozAtual;
            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${SUA_CHAVE_API}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: texto },
                    voice: { 
                        languageCode: 'pt-BR', 
                        name: vozParaUsar 
                    },
                    audioConfig: { 
                        audioEncoding: 'LINEAR16',
                        speakingRate: velocidadeAtual,
                        pitch: 0.0
                    }
                })
            });
            const data = await response.json();
            
            if (!response.ok && data.error) {
                console.error('Erro na API:', {
                    code: data.error.code,
                    message: data.error.message,
                    details: data.error.details || 'Nenhum detalhe disponível'
                });
                if (data.error.code === 400 && vozParaUsar !== vozFallback) {
                    console.warn('Voz inválida, usando fallback:', vozParaUsar);
                    const fallbackResponse = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${SUA_CHAVE_API}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            input: { text: texto },
                            voice: { 
                                languageCode: 'pt-BR', 
                                name: vozFallback 
                            },
                            audioConfig: { 
                                audioEncoding: 'LINEAR16',
                                speakingRate: velocidadeAtual,
                                pitch: 0.0
                            }
                        })
                    });
                    const fallbackData = await fallbackResponse.json();
                    if (!fallbackResponse.ok) {
                        throw new Error(`Erro na API (fallback): ${JSON.stringify({
                            code: fallbackData.error.code,
                            message: fallbackData.error.message,
                            details: fallbackData.error.details || 'Nenhum detalhe disponível'
                        })}`);
                    }
                    vozAtual = vozFallback;
                    vozSelect.value = vozFallback;
                    console.log(`Fallback para voz: ${vozAtual}`);
                    const audioSrc = 'data:audio/wav;base64,' + fallbackData.audioContent;
                    if (!isQuestion) audioCache.set(cacheKey, audioSrc);
                    audioAtual = new Audio(audioSrc);
                    audioAtual.onended = onEndedCallback;
                    isAudioPlaying = true;
                    audioAtual.play().then(() => {
                        isProcessingAudio = false;
                        toggleButtons(false);
                        console.log('Áudio reproduzido com sucesso (fallback)');
                    }).catch((error) => {
                        console.error('Erro ao reproduzir áudio (fallback):', error);
                        isProcessingAudio = false;
                        toggleButtons(false);
                        pararLeitura(false);
                    });
                    return;
                } else {
                    throw new Error(`Erro na API: ${JSON.stringify({
                        code: data.error.code,
                        message: data.error.message,
                        details: data.error.details || 'Nenhum detalhe disponível'
                    })}`);
                }
            }
            
            if (data.audioContent) {
                const audioSrc = 'data:audio/wav;base64,' + data.audioContent;
                if (!isQuestion) audioCache.set(cacheKey, audioSrc);
                audioAtual = new Audio(audioSrc);
                audioAtual.onended = onEndedCallback;
                isAudioPlaying = true;
                audioAtual.play().then(() => {
                    isProcessingAudio = false;
                    toggleButtons(false);
                    console.log('Áudio reproduzido com sucesso');
                }).catch((error) => {
                    console.error('Erro ao reproduzir áudio:', error);
                    isProcessingAudio = false;
                    toggleButtons(false);
                    pararLeitura(false);
                });
            } else {
                throw new Error('Nenhum áudio retornado pela API');
            }
        } catch (error) {
            console.error('Erro ao chamar a API:', error.message);
            alert(`Ocorreu um erro ao gerar o áudio: ${error.message}. Revertendo para voz padrão. Consulte o console para detalhes.`);
            vozAtual = vozFallback;
            vozSelect.value = vozFallback;
            isProcessingAudio = false;
            toggleButtons(false);
            pararLeitura(false);
        }
    }
});