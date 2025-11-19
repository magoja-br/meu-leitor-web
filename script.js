document.addEventListener('DOMContentLoaded', () => {
    // URL do backend hospedado no Render.com
    const backendUrl = 'https://meu-proxy-tts.onrender.com/synthesize';

    const cabecalho = document.querySelector('header');
    const fileInput = document.getElementById('file-input');
    const areaLeitura = document.getElementById('conteudo-leitura');
    const vozSelect = document.getElementById('voz-select');
    const velocidadeSlider = document.getElementById('velocidade-slider');
    const velocidadeValor = document.getElementById('velocidade-valor');
    const barraProgressoContainer = document.getElementById('barra-progresso-container');
    const barraProgressoPreenchida = document.getElementById('barra-progresso-preenchida');
    const progressoTexto = document.getElementById('progresso-texto');
    const progressoPercentual = document.getElementById('progresso-percentual');

    // Variáveis de estado do player de áudio
    let indiceParagrafoAtual = 0;
    let indiceChunkAtual = 0;
    let paragrafosDoTexto = [];
    let chunksAtuais = [];
    let estadoLeitura = 'parado';
    let audioAtual = null;
    let isAudioPlaying = false;
    let velocidadeAtual = 1.00;
    let vozAtual = 'pt-BR-Chirp3-HD-Algieba';
    let nomeArquivoAtual = '';

    // Cache de áudio
    const audioCache = new Map();

    // Fallback para voz inválida
    const vozFallback = 'pt-BR-Chirp3-HD-Achird';

    // Tamanho máximo do chunk em caracteres
    const TAMANHO_CHUNK = 1500;

    // Eventos principais
    fileInput.addEventListener('change', handleFileSelect);
    areaLeitura.addEventListener('click', iniciarLeituraDePontoEspecifico);
    vozSelect.addEventListener('change', (e) => {
        vozAtual = e.target.value;
        audioCache.clear();
    });
    velocidadeSlider.addEventListener('input', (e) => {
        velocidadeAtual = parseFloat(e.target.value);
        velocidadeValor.textContent = velocidadeAtual.toFixed(2);
        audioCache.clear();
    });

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        nomeArquivoAtual = file.name;
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

    // Função para dividir texto em chunks de 1500 caracteres em pontos naturais
    function dividirEmChunks(texto) {
        if (texto.length <= TAMANHO_CHUNK) {
            return [texto];
        }

        const chunks = [];
        let inicio = 0;

        while (inicio < texto.length) {
            let fim = inicio + TAMANHO_CHUNK;

            // Se não chegou ao fim do texto, procura um ponto natural para quebrar
            if (fim < texto.length) {
                // Procura por ponto final, vírgula ou espaço (nessa ordem de prioridade)
                let pontoFinal = texto.lastIndexOf('.', fim);
                let virgula = texto.lastIndexOf(',', fim);
                let espaco = texto.lastIndexOf(' ', fim);

                // Escolhe o ponto de quebra mais próximo do limite
                if (pontoFinal > inicio && pontoFinal > fim - 200) {
                    fim = pontoFinal + 1; // Inclui o ponto
                } else if (virgula > inicio && virgula > fim - 200) {
                    fim = virgula + 1; // Inclui a vírgula
                } else if (espaco > inicio) {
                    fim = espaco + 1; // Inclui o espaço
                }
            }

            chunks.push(texto.substring(inicio, fim).trim());
            inicio = fim;
        }

        return chunks;
    }

    function exibirTexto(texto) {
        pararLeitura(true);
        areaLeitura.innerHTML = '';
        audioCache.clear();
        
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
        
        // Mostrar barra de progresso
        barraProgressoContainer.style.display = 'block';
        
        // Tentar carregar progresso salvo
        carregarProgresso();
        
        atualizarBotoesNavegacao();
        atualizarBarraProgresso();
    }

    function atualizarBarraProgresso() {
        const total = paragrafosDoTexto.length;
        const atual = indiceParagrafoAtual + 1;
        const percentual = total > 0 ? Math.round((atual / total) * 100) : 0;

        progressoTexto.textContent = `Parágrafo ${atual} de ${total}`;
        progressoPercentual.textContent = `${percentual}%`;
        barraProgressoPreenchida.style.width = `${percentual}%`;
    }

    function salvarProgresso() {
        if (!nomeArquivoAtual) return;
        
        const progresso = {
            arquivo: nomeArquivoAtual,
            paragrafo: indiceParagrafoAtual,
            chunk: indiceChunkAtual,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem(`progresso_${nomeArquivoAtual}`, JSON.stringify(progresso));
    }

    function carregarProgresso() {
        if (!nomeArquivoAtual) return;
        
        const progressoSalvo = localStorage.getItem(`progresso_${nomeArquivoAtual}`);
        if (progressoSalvo) {
            const progresso = JSON.parse(progressoSalvo);
            indiceParagrafoAtual = progresso.paragrafo || 0;
            indiceChunkAtual = progresso.chunk || 0;
            
            // Rolar até o parágrafo salvo
            if (paragrafosDoTexto[indiceParagrafoAtual]) {
                paragrafosDoTexto[indiceParagrafoAtual].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            atualizarBarraProgresso();
        }
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
            indiceChunkAtual = 0;
            atualizarBotoesNavegacao();
            atualizarBarraProgresso();
            salvarProgresso();
            tocarPausarLeitura();
        }
    }

    function avancarParagrafo() {
        if (indiceParagrafoAtual < paragrafosDoTexto.length - 1) {
            pararLeitura(false);
            indiceParagrafoAtual++;
            indiceChunkAtual = 0;
            atualizarBotoesNavegacao();
            atualizarBarraProgresso();
            salvarProgresso();
            tocarPausarLeitura();
        }
    }

    function retrocederParagrafo() {
        if (indiceParagrafoAtual > 0) {
            pararLeitura(false);
            indiceParagrafoAtual--;
            indiceChunkAtual = 0;
            atualizarBotoesNavegacao();
            atualizarBarraProgresso();
            salvarProgresso();
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
        salvarProgresso();
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
            indiceChunkAtual = 0;
            atualizarBotoesNavegacao();
            atualizarBarraProgresso();
        }
        
        salvarProgresso();
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
        
        const textoCompleto = paragrafoAtual.textContent;
        
        // Divide o parágrafo em chunks se necessário
        if (indiceChunkAtual === 0) {
            chunksAtuais = dividirEmChunks(textoCompleto);
        }
        
        // Verifica se ainda há chunks para ler no parágrafo atual
        if (indiceChunkAtual < chunksAtuais.length) {
            const textoChunk = chunksAtuais[indiceChunkAtual];
            
            const onAudioEnd = () => {
                isAudioPlaying = false;
                indiceChunkAtual++;
                
                // Se terminou todos os chunks do parágrafo, avança para o próximo
                if (indiceChunkAtual >= chunksAtuais.length) {
                    indiceParagrafoAtual++;
                    indiceChunkAtual = 0;
                    atualizarBotoesNavegacao();
                    atualizarBarraProgresso();
                }
                
                salvarProgresso();
                lerProximoParagrafo();
            };

            tocarAudio(textoChunk, onAudioEnd);
        } else {
            // Se não há mais chunks, avança para o próximo parágrafo
            indiceParagrafoAtual++;
            indiceChunkAtual = 0;
            atualizarBotoesNavegacao();
            atualizarBarraProgresso();
            salvarProgresso();
            lerProximoParagrafo();
        }
    }

    async function tocarAudio(texto, onEndedCallback) {
        if (isAudioPlaying) {
            pararLeitura(false);
        }

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
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: texto,
                    voice: vozAtual,
                    speakingRate: velocidadeAtual
                })
            });

            if (!response.ok) {
                throw new Error(`Erro na API: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.audioContent) {
                const audioSrc = 'data:audio/wav;base64,' + data.audioContent;
                if (!isQuestion) audioCache.set(cacheKey, audioSrc);
                audioAtual = new Audio(audioSrc);
                audioAtual.onended = onEndedCallback;
                isAudioPlaying = true;
                audioAtual.play();
            } else {
                console.error('Erro na resposta da API:', data);
                alert('Não foi possível gerar o áudio. Verifique o backend no Render.com');
                pararLeitura(true);
            }
        } catch (error) {
            console.error('Erro ao chamar a API:', error);
            alert('Ocorreu um erro ao tentar gerar o áudio. Verifique sua conexão ou o backend no Render.com');
            pararLeitura(true);
        }
    }
});