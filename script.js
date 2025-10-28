document.addEventListener('DOMContentLoaded', () => {
    // Cole sua Chave de API do Google Cloud aqui.
    // const apiKey = "chave"; // REMOVIDA OU COMENTADA

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
    let isProcessingAudio = false; // Flag para evitar múltiplas chamadas
    let velocidadeAtual = 1.00;
    let vozAtual = 'pt-BR-Neural2-B'; // Voz padrão inicial
    let vozesDisponiveis = []; // Armazena as vozes carregadas

    // Cache de áudio
    const audioCache = new Map();

    // Voz de fallback caso a selecionada falhe ou não seja encontrada
    const vozFallback = 'pt-BR-Neural2-B'; // Ou outra voz Neural2/Wavenet que funcione bem

    // Função para sanitizar texto antes de enviar para a API
    function sanitizeText(text) {
        if (!text || typeof text !== 'string') return '';
        // Remove emojis e caracteres potencialmente problemáticos, limita tamanho
        return text.replace(/[\u{1F600}-\u{1F6FF}]/gu, '') // Remove emojis comuns
                   .replace(/[^\p{L}\p{N}\p{P}\p{Z}]/gu, '') // Mantém letras, números, pontuação e espaços (Unicode)
                   .trim()
                   .substring(0, 5000); // Limita a API do Google TTS a 5000 caracteres
    }

    // Função para carregar vozes disponíveis (ainda usa a chave API, mas só para listar vozes)
    // ATENÇÃO: Se esta função também der problemas de exposição, ela também precisaria ser movida para o backend.
    // Por enquanto, assumimos que listar vozes é menos crítico que a síntese.
    async function carregarVozesDisponiveis() {
        // !! CUIDADO: Esta parte ainda expõe a chave para listar vozes.
        // Se a segurança for máxima, mova esta lógica para o backend também.
        const SUA_CHAVE_API_PARA_LISTAR = "SUA_CHAVE_API_REAL_AQUI"; // SUBSTITUA AQUI TAMBÉM

        if (SUA_CHAVE_API_PARA_LISTAR === "SUA_CHAVE_API_REAL_AQUI" || SUA_CHAVE_API_PARA_LISTAR.length < 10) {
             console.warn("Chave API não configurada para listar vozes. Usando lista padrão.");
             // Usar vozes padrão se a chave não estiver configurada
             const vozesPadrao = [
                 { name: 'pt-BR-Neural2-B', gender: 'MALE' },
                 { name: 'pt-BR-Neural2-D', gender: 'MALE' },
                 { name: 'pt-BR-Neural2-A', gender: 'FEMALE' },
                 { name: 'pt-BR-Neural2-C', gender: 'FEMALE' },
                 { name: 'pt-BR-Wavenet-A', gender: 'FEMALE'}, // Adicionando Wavenet como exemplo
                 { name: 'pt-BR-Wavenet-B', gender: 'MALE'},
                 { name: 'pt-BR-Wavenet-D', gender: 'FEMALE'}
             ];
             preencherDropdownVozes(vozesPadrao);
             return; // Sai da função
         }

        try {
            // Chamada para listar vozes - requer chave API
            const response = await fetch(`https://texttospeech.googleapis.com/v1/voices?key=${SUA_CHAVE_API_PARA_LISTAR}`);
            if (!response.ok) {
                throw new Error(`Erro ao buscar vozes: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();

            if (data.voices && data.voices.length > 0) {
                const vozesFiltradas = data.voices
                    .filter(voice => voice.languageCodes.includes('pt-BR') && (voice.name.includes('Neural2') || voice.name.includes('Wavenet')))
                    .map(voice => ({
                        name: voice.name,
                        gender: voice.ssmlGender || 'UNKNOWN'
                    }));
                preencherDropdownVozes(vozesFiltradas);
            } else {
                console.warn('Nenhuma voz pt-BR (Neural2/Wavenet) retornada pela API. Usando lista padrão.');
                const vozesPadrao = [ /* Mesma lista padrão acima */ ];
                preencherDropdownVozes(vozesPadrao);
            }
        } catch (error) {
            console.error('Erro ao carregar vozes da API:', error);
            alert('Não foi possível carregar as vozes da Google. Usando vozes padrão.');
            const vozesPadrao = [ /* Mesma lista padrão acima */ ];
            preencherDropdownVozes(vozesPadrao);
        }
    }

    // Função auxiliar para preencher o dropdown de vozes
    function preencherDropdownVozes(listaVozes) {
        vozesDisponiveis = listaVozes; // Atualiza a lista global
        vozSelect.innerHTML = ''; // Limpa opções existentes

        vozesDisponiveis.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            let genderText = 'Desconhecido';
            if (voice.gender === 'MALE') genderText = 'Masculina';
            else if (voice.gender === 'FEMALE') genderText = 'Feminina';
            option.textContent = `${voice.name} (${genderText})`;
            vozSelect.appendChild(option);
        });

        // Tenta manter a voz padrão ou usa o fallback
        if (vozesDisponiveis.some(voice => voice.name === vozAtual)) {
            vozSelect.value = vozAtual;
        } else if (vozesDisponiveis.some(voice => voice.name === vozFallback)) {
            console.warn(`Voz padrão ${vozAtual} não encontrada na lista, usando fallback ${vozFallback}.`);
            vozAtual = vozFallback;
            vozSelect.value = vozFallback;
        } else if (vozesDisponiveis.length > 0) {
            console.warn(`Voz padrão e fallback não encontradas. Usando a primeira voz da lista: ${vozesDisponiveis[0].name}`);
            vozAtual = vozesDisponiveis[0].name;
            vozSelect.value = vozAtual;
        } else {
             console.error("Nenhuma voz disponível para selecionar.");
             // Poderia desabilitar o select ou mostrar mensagem
        }
        console.log('Vozes carregadas no dropdown. Voz atual:', vozAtual);
    }


    // Função para desabilitar/habilitar botões durante transições ou processamento
    function toggleButtons(disabled) {
        const buttons = [
            document.getElementById('play-pause-btn'),
            document.getElementById('stop-btn'),
            document.getElementById('prev-btn'),
            document.getElementById('next-btn'),
            voltarBtn // Inclui o botão voltar
        ];
        buttons.forEach(btn => {
            if (btn) btn.disabled = disabled;
        });
        // Desabilita também input de arquivo e selects enquanto processa
        if (fileInput) fileInput.disabled = disabled;
        if (vozSelect) vozSelect.disabled = disabled;
        if (velocidadeSlider) velocidadeSlider.disabled = disabled;
    }

    // Função de debounce para evitar cliques múltiplos rápidos
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

    // --- Inicialização e Eventos ---

    // Carrega vozes disponíveis ao iniciar
    // Removido daqui para evitar chamada com chave exposta logo de cara
    // carregarVozesDisponiveis(); // -> Mover para após a configuração da chave ou usar lista padrão

    // **Alternativa:** Usar uma lista padrão inicial e carregar da API apenas se necessário (ou mover para backend)
    preencherDropdownVozes([
        { name: 'pt-BR-Neural2-B', gender: 'MALE' },
        { name: 'pt-BR-Neural2-D', gender: 'MALE' },
        { name: 'pt-BR-Neural2-A', gender: 'FEMALE' },
        { name: 'pt-BR-Neural2-C', gender: 'FEMALE' },
        { name: 'pt-BR-Wavenet-A', gender: 'FEMALE'},
        { name: 'pt-BR-Wavenet-B', gender: 'MALE'},
        { name: 'pt-BR-Wavenet-D', gender: 'FEMALE'}
    ]);


    // Event listener para o input de arquivo
    fileInput.addEventListener('change', handleFileSelect);

    // Event listener para cliques na área de leitura (para iniciar de ponto específico)
    areaLeitura.addEventListener('click', debounce(iniciarLeituraDePontoEspecifico, 200));

    // Event listener para mudança de voz
    vozSelect.addEventListener('change', (e) => {
        const novaVoz = e.target.value;
        // Validação extra (embora preencherDropdownVozes já deva garantir)
        if (vozesDisponiveis.some(voice => voice.name === novaVoz)) {
            vozAtual = novaVoz;
        } else {
            console.warn(`Voz selecionada ${novaVoz} inválida, mantendo ${vozAtual}.`);
            e.target.value = vozAtual; // Reverte a seleção no dropdown
            return; // Não faz nada se a voz for inválida
        }

        audioCache.clear(); // Limpa o cache ao mudar a voz
        console.log(`Voz alterada para: ${vozAtual}`);

        // Feedback visual
        vozSelect.classList.add('changed');
        setTimeout(() => vozSelect.classList.remove('changed'), 1000);

        // Se estava tocando ou pausado, para e reinicia a leitura do parágrafo atual com a nova voz
        if (estadoLeitura === 'tocando' || estadoLeitura === 'pausado') {
            pararLeitura(false); // Para áudio atual, mantém índice
            tocarPausarLeitura(); // Inicia a leitura do mesmo parágrafo com nova voz
        }
    });

    // Event listener para mudança de velocidade
    velocidadeSlider.addEventListener('input', (e) => {
        velocidadeAtual = parseFloat(e.target.value);
        velocidadeValor.textContent = velocidadeAtual.toFixed(2); // Atualiza o valor exibido
        // Limpar o cache pode ser opcional aqui, mas garante que a nova velocidade seja usada
        // Se a API for chamada novamente. Se o áudio já estiver tocando, pode não ter efeito imediato.
        // audioCache.clear();
        console.log(`Velocidade alterada para: ${velocidadeAtual}`);
        // Se o áudio estiver tocando, podemos tentar ajustar a velocidade (nem sempre funciona bem)
        if (audioAtual && !audioAtual.paused) {
            audioAtual.playbackRate = velocidadeAtual;
        }
    });

    // Event listener para o botão "Voltar"
    voltarBtn.addEventListener('click', debounce(() => {
        if (isProcessingAudio) return; // Não faz nada se estiver processando
        pausarLeitura(); // Pausa a leitura, mas mantém o índice
        cabecalho.classList.remove('hidden'); // Mostra o cabeçalho
        voltarBtn.style.display = 'none'; // Esconde o botão voltar
        window.scrollTo({ top: 0, behavior: 'smooth' }); // Volta ao topo
        console.log(`Botão VOLTAR clicado, leitura pausada no índice: ${indiceParagrafoAtual}`);
    }, 200));

    // --- Funções de Manipulação de Arquivo ---

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        areaLeitura.innerHTML = `<p class="aviso">Carregando e processando "${file.name}"...</p>`;
        voltarBtn.style.display = 'none'; // Esconde o botão voltar ao carregar novo arquivo
        const playerContainer = document.getElementById('player-container');
        if (playerContainer) playerContainer.remove(); // Remove player antigo se existir

        const fileType = file.name.split('.').pop().toLowerCase();

        // Usa um objeto FileReader para todos os tipos que o suportam
        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                let textoCompleto = '';
                if (fileType === 'txt') {
                    textoCompleto = e.target.result;
                } else if (fileType === 'pdf') {
                    // Carrega pdf.js dinamicamente se necessário
                    if (typeof pdfjsLib === 'undefined') {
                       alert('Biblioteca PDF.js não carregada. Recarregue a página ou verifique a conexão.');
                       areaLeitura.innerHTML = `<p class="aviso">Erro ao carregar recursos para PDF.</p>`;
                       return;
                    }
                    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`; // Verifique a versão
                    const pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        textoCompleto += textContent.items.map(item => item.str).join(' ') + '\n'; // Adiciona espaço e nova linha
                    }
                } else if (fileType === 'docx') {
                     // Carrega mammoth.js dinamicamente se necessário
                    if (typeof mammoth === 'undefined') {
                        alert('Biblioteca Mammoth.js não carregada. Recarregue a página ou verifique a conexão.');
                        areaLeitura.innerHTML = `<p class="aviso">Erro ao carregar recursos para DOCX.</p>`;
                        return;
                    }
                    const result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                    textoCompleto = result.value;
                }
                // Adicione outros tipos aqui se necessário (xlsx é tratado separadamente abaixo)

                exibirTexto(textoCompleto); // Exibe o texto extraído

            } catch (error) {
                console.error(`Erro ao processar ${fileType.toUpperCase()}:`, error);
                areaLeitura.innerHTML = `<p class="aviso">Ocorreu um erro ao ler o arquivo ${fileType.toUpperCase()}. Verifique o formato ou tente outro arquivo.</p>`;
                pararLeitura(true); // Garante que tudo seja resetado
            }
        };

        reader.onerror = (e) => {
             console.error("Erro ao ler o arquivo:", e);
             areaLeitura.innerHTML = `<p class="aviso">Não foi possível ler o arquivo selecionado.</p>`;
             pararLeitura(true);
        };

        // Decide como ler o arquivo baseado no tipo
        if (fileType === 'txt') {
            reader.readAsText(file, 'UTF-8'); // Especifica UTF-8 para TXT
        } else if (fileType === 'pdf' || fileType === 'docx') {
            reader.readAsArrayBuffer(file); // PDF e DOCX precisam de ArrayBuffer
        } else if (fileType === 'xlsx') {
            // XLSX usa uma lógica diferente (provavelmente da biblioteca SheetJS original)
            // Mantendo a lógica original para XLSX se ela existir
             if (typeof loadFileData === 'function' && typeof gk_isXlsx !== 'undefined') {
                  const xlsxReader = new FileReader();
                  xlsxReader.onload = (ev) => {
                        try {
                            // Simula a lógica anterior se necessária
                            window.gk_isXlsx = true;
                            window.gk_xlsxFileLookup = window.gk_xlsxFileLookup || {};
                            window.gk_fileData = window.gk_fileData || {};
                            window.gk_xlsxFileLookup[file.name] = true;
                            window.gk_fileData[file.name] = ev.target.result.split(',')[1]; // Assume base64

                            const csvText = loadFileData(file.name); // Chama a função externa
                            if (csvText) {
                                const lines = csvText.split('\n').filter(line => line.trim() !== '');
                                exibirTexto(lines.join('\n'));
                            } else {
                                throw new Error('A função loadFileData não retornou dados para o XLSX.');
                            }
                        } catch (error) {
                            console.error('Erro ao processar XLSX com loadFileData:', error);
                            areaLeitura.innerHTML = `<p class="aviso">Ocorreu um erro ao ler o arquivo XLSX.</p>`;
                            pararLeitura(true);
                        } finally {
                            window.gk_isXlsx = false; // Reseta a flag global
                        }
                  };
                   xlsxReader.onerror = (ev) => {
                        console.error("Erro ao ler o arquivo XLSX:", ev);
                        areaLeitura.innerHTML = `<p class="aviso">Não foi possível ler o arquivo XLSX.</p>`;
                        pararLeitura(true);
                   };
                  xlsxReader.readAsDataURL(file); // Lê como Data URL para a lógica original
             } else {
                  console.error("Funções necessárias para XLSX não encontradas.");
                  areaLeitura.innerHTML = `<p class="aviso">Processamento de XLSX não configurado corretamente.</p>`;
                  pararLeitura(true);
             }

        } else {
            areaLeitura.innerHTML = `<p class="aviso">Formato de arquivo não suportado (.${fileType}). Escolha .txt, .pdf, .docx ou .xlsx.</p>`;
            pararLeitura(true);
        }
    }


    // --- Funções de Exibição e Controle ---

    function exibirTexto(texto) {
        pararLeitura(true); // Reseta tudo ao exibir novo texto
        areaLeitura.innerHTML = ''; // Limpa área
        audioCache.clear(); // Limpa cache de áudio

        // Remove o painel de controle antigo, se existir
        const painelControleAntigo = document.getElementById('player-container');
        if (painelControleAntigo) painelControleAntigo.remove();

        // Cria e insere o novo painel de controle
        const playerHtml = `
            <div id="player-container" class="player-controls">
                <button id="prev-btn" class="player-button" title="Ir para o parágrafo anterior" disabled>←</button>
                <button id="play-pause-btn" class="player-button" title="Tocar / Pausar">▶️</button>
                <button id="stop-btn" class="player-button" title="Parar e voltar ao início">⏹️</button>
                <button id="next-btn" class="player-button" title="Ir para o próximo parágrafo">→</button>
            </div>`;
        // Insere o player DEPOIS do cabeçalho, não dentro dele
        cabecalho.insertAdjacentHTML('afterend', playerHtml);

        // Adiciona os event listeners aos novos botões do player
        document.getElementById('play-pause-btn').addEventListener('click', debounce(tocarPausarLeitura, 200));
        document.getElementById('stop-btn').addEventListener('click', debounce(() => {
            if (isProcessingAudio) return; // Não faz nada se estiver processando
            pararLeitura(true); // Para e reseta o índice
            cabecalho.classList.remove('hidden'); // Mostra o cabeçalho
            voltarBtn.style.display = 'none'; // Esconde o botão voltar
            window.scrollTo({ top: 0, behavior: 'smooth' }); // Rola para o topo
            console.log('Leitura parada pelo botão STOP, índice resetado para 0');
        }, 200));
        document.getElementById('prev-btn').addEventListener('click', debounce(retrocederParagrafo, 200));
        document.getElementById('next-btn').addEventListener('click', debounce(avancarParagrafo, 200));

        // Processa e exibe os parágrafos
        // Divide por duas quebras de linha ou mais para parágrafos, ou uma se for o fallback
        const paragrafos = texto.split(/\n{2,}/).length > 1 ? texto.split(/\n{2,}/) : texto.split('\n');

        paragrafosDoTexto = []; // Limpa o array antes de preencher
        areaLeitura.innerHTML = ''; // Garante que a área está limpa

        paragrafos.forEach((p_texto, index) => {
            const textoLimpo = p_texto.trim();
            if (textoLimpo) { // Só adiciona se não estiver vazio
                const p = document.createElement('p');
                p.className = 'paragrafo';
                p.dataset.index = index; // Adiciona um índice para referência
                p.textContent = textoLimpo;
                areaLeitura.appendChild(p);
                paragrafosDoTexto.push(p); // Adiciona o elemento DOM ao array
            }
        });

        indiceParagrafoAtual = 0; // Começa do primeiro parágrafo
        atualizarBotoesNavegacao(); // Atualiza estado inicial dos botões
        console.log(`Texto exibido. ${paragrafosDoTexto.length} parágrafos encontrados.`);
        // Mostra o botão voltar, pois um texto foi carregado
        voltarBtn.style.display = 'block';
    }


    // Atualiza o estado visual dos botões de navegação
    function atualizarBotoesNavegacao() {
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const playPauseBtn = document.getElementById('play-pause-btn');

        if (prevBtn) {
            prevBtn.disabled = indiceParagrafoAtual <= 0 || isProcessingAudio;
        }
        if (nextBtn) {
            nextBtn.disabled = indiceParagrafoAtual >= paragrafosDoTexto.length - 1 || isProcessingAudio;
        }
        // Habilita/Desabilita play/pause baseado se há parágrafos
        if (playPauseBtn) {
             playPauseBtn.disabled = paragrafosDoTexto.length === 0 || isProcessingAudio;
        }
        // Log para depuração
        // console.log(`Botões atualizados: prev=${prevBtn?.disabled}, next=${nextBtn?.disabled}, play=${playPauseBtn?.disabled}, indice=${indiceParagrafoAtual}`);
    }

    // Inicia a leitura a partir do parágrafo clicado
    function iniciarLeituraDePontoEspecifico(event) {
        if (isProcessingAudio) return; // Ignora clique se estiver processando áudio
        const paragrafoClicado = event.target.closest('.paragrafo');
        if (!paragrafoClicado || paragrafosDoTexto.length === 0) return; // Ignora se não clicou num parágrafo ou se não há texto

        const novoIndice = Array.from(paragrafosDoTexto).indexOf(paragrafoClicado);

        if (novoIndice !== -1) {
            console.log(`Clique detectado. Iniciando leitura no parágrafo ${novoIndice}`);
            pararLeitura(false); // Para qualquer leitura atual, mas mantém o índice onde estava (será atualizado)
            indiceParagrafoAtual = novoIndice; // Define o novo índice
            atualizarDestaqueParagrafo(); // Atualiza visualmente qual parágrafo está selecionado
            atualizarBotoesNavegacao(); // Atualiza os botões Prev/Next
            tocarPausarLeitura(); // Inicia a leitura a partir do novo índice
        }
    }

     // Adiciona/Remove classe CSS para destacar o parágrafo atual
     function atualizarDestaqueParagrafo() {
         paragrafosDoTexto.forEach((p, index) => {
             if (index === indiceParagrafoAtual && estadoLeitura === 'tocando') {
                 p.classList.add('lendo-agora');
                 // Rola a tela para manter o parágrafo visível
                 p.scrollIntoView({ behavior: 'smooth', block: 'center' });
             } else {
                 p.classList.remove('lendo-agora');
             }
         });
     }


    // --- Funções de Controle de Leitura ---

    function avancarParagrafo() {
        if (isProcessingAudio) return; // Bloqueia se estiver processando
        if (indiceParagrafoAtual < paragrafosDoTexto.length - 1) {
            pararLeitura(false); // Para o áudio atual, mantém o índice (será incrementado)
            indiceParagrafoAtual++;
            console.log(`Avançando para parágrafo ${indiceParagrafoAtual}`);
            atualizarDestaqueParagrafo(); // Atualiza destaque visual
            atualizarBotoesNavegacao();
            tocarPausarLeitura(); // Inicia a leitura do novo parágrafo
        } else {
            console.log("Já está no último parágrafo.");
        }
    }

    function retrocederParagrafo() {
        if (isProcessingAudio) return; // Bloqueia se estiver processando
        if (indiceParagrafoAtual > 0) {
            pararLeitura(false); // Para o áudio atual, mantém o índice (será decrementado)
            indiceParagrafoAtual--;
            console.log(`Retrocedendo para parágrafo ${indiceParagrafoAtual}`);
            atualizarDestaqueParagrafo(); // Atualiza destaque visual
            atualizarBotoesNavegacao();
            tocarPausarLeitura(); // Inicia a leitura do novo parágrafo
        } else {
            console.log("Já está no primeiro parágrafo.");
        }
    }

    function tocarPausarLeitura() {
        if (isProcessingAudio) {
            console.warn('Tentativa de tocar/pausar enquanto processa áudio. Ignorado.');
            return; // Evita ações concorrentes
        }
        if (paragrafosDoTexto.length === 0) {
            console.warn("Nenhum parágrafo para ler.");
            return;
        }

        const btn = document.getElementById('play-pause-btn');
        if (!btn) return; // Sai se o botão não existir

        if (estadoLeitura === 'tocando') {
            // Se está tocando -> Pausar
            console.log('Pausando leitura...');
            pausarLeitura(); // Função que pausa o áudio e atualiza estado/botão
        } else {
            // Se está parado ou pausado -> Tocar
            console.log(`Iniciando/Retomando leitura no parágrafo ${indiceParagrafoAtual}`);
            btn.innerHTML = '⏸️'; // Muda ícone para Pausa
            estadoLeitura = 'tocando';
            cabecalho.classList.add('hidden'); // Esconde cabeçalho
            voltarBtn.style.display = 'block'; // Mostra botão voltar
            toggleButtons(true); // Desabilita botões temporariamente

            if (audioAtual && audioAtual.paused && !isAudioPlaying) {
                // Se existe um áudio pausado, apenas retoma
                 console.log('Retomando áudio pausado...');
                 audioAtual.play().then(() => {
                     isAudioPlaying = true;
                     toggleButtons(false); // Reabilita botões após iniciar
                     atualizarBotoesNavegacao(); // Garante estado correto
                     atualizarDestaqueParagrafo(); // Garante destaque
                     console.log('Áudio retomado.');
                 }).catch((error) => {
                     console.error('Erro ao retomar áudio:', error);
                     alert('Não foi possível retomar o áudio.');
                     pararLeitura(false); // Para e reabilita botões
                 });
            } else {
                // Se não há áudio pausado, busca e toca o próximo (ou atual)
                 console.log('Buscando e tocando novo áudio...');
                 // Adiciona um pequeno delay para UI atualizar antes de chamar a API
                 setTimeout(() => lerParagrafoAtual(), 100); // Chama a função que busca/toca
            }
        }
    }

    // Pausa a reprodução atual
    function pausarLeitura() {
        if (audioAtual) {
            audioAtual.pause();
            isAudioPlaying = false; // Marca que não está tocando ativamente
        }
        estadoLeitura = 'pausado';
        const btn = document.getElementById('play-pause-btn');
        if(btn) btn.innerHTML = '▶️'; // Muda ícone para Play
        // Não esconde cabeçalho ou botão voltar ao pausar
        // cabecalho.classList.remove('hidden');
        // voltarBtn.style.display = 'none';
        toggleButtons(false); // Reabilita botões ao pausar
        atualizarBotoesNavegacao();
        console.log(`Leitura pausada no índice: ${indiceParagrafoAtual}`);
        // Remove destaque ao pausar
        const paragrafoLendo = document.querySelector('.lendo-agora');
        if (paragrafoLendo) {
            paragrafoLendo.classList.remove('lendo-agora');
        }
    }

    // Para completamente a reprodução
    function pararLeitura(resetarIndice = false) {
        if (audioAtual) {
            audioAtual.pause();
            audioAtual.onended = null; // Remove o listener para evitar chamar lerProximoParagrafo
            audioAtual.src = ''; // Libera recursos
            audioAtual.load(); // Garante interrupção
            audioAtual = null;
            isAudioPlaying = false;
        }
        isProcessingAudio = false; // Garante que o processamento seja liberado

        // Remove destaque
        const paragrafoLendo = document.querySelector('.lendo-agora');
        if (paragrafoLendo) {
            paragrafoLendo.classList.remove('lendo-agora');
        }

        estadoLeitura = 'parado';
        const btn = document.getElementById('play-pause-btn');
        if (btn) btn.innerHTML = '▶️'; // Muda ícone para Play
        cabecalho.classList.remove('hidden'); // Mostra cabeçalho
        voltarBtn.style.display = 'none'; // Esconde botão voltar
        toggleButtons(false); // Reabilita botões

        if (resetarIndice) {
            indiceParagrafoAtual = 0;
            if (paragrafosDoTexto.length > 0) {
                 window.scrollTo({ top: paragrafosDoTexto[0].offsetTop - 100, behavior: 'smooth' }); // Rola para o primeiro parágrafo
            } else {
                 window.scrollTo({ top: 0, behavior: 'smooth' }); // Rola para o topo se não houver texto
            }
        }
        atualizarBotoesNavegacao(); // Atualiza estado dos botões
        console.log(`Leitura parada. Resetar índice: ${resetarIndice}. Índice final: ${indiceParagrafoAtual}`);
    }

    // Função central que lê o parágrafo atual e agenda o próximo
    function lerParagrafoAtual() {
        // Verifica se ainda deve tocar (pode ter sido parado/pausado enquanto esperava o setTimeout)
        if (estadoLeitura !== 'tocando') {
             console.log("lerParagrafoAtual chamado, mas estado não é 'tocando'. Parando.");
             toggleButtons(false); // Garante que botões sejam reabilitados
             atualizarBotoesNavegacao();
             return;
        }

        // Verifica limites do array
        if (indiceParagrafoAtual >= paragrafosDoTexto.length) {
            console.log('Fim do texto alcançado.');
            pararLeitura(true); // Para e reseta o índice
            alert("Leitura concluída!");
            return;
        }

        const paragrafoAtual = paragrafosDoTexto[indiceParagrafoAtual];
        if (!paragrafoAtual) {
            console.error(`Erro: Parágrafo no índice ${indiceParagrafoAtual} não encontrado.`);
            pararLeitura(true);
            return;
        }

        atualizarDestaqueParagrafo(); // Destaca o parágrafo atual e rola a tela

        const texto = sanitizeText(paragrafoAtual.textContent);

        // Se o parágrafo estiver vazio após sanitização, pula para o próximo
        if (!texto) {
            console.warn(`Parágrafo ${indiceParagrafoAtual} vazio após sanitização. Pulando.`);
            indiceParagrafoAtual++;
            // Não precisa chamar toggleButtons(false) aqui, pois lerParagrafoAtual será chamado de novo
            setTimeout(() => lerParagrafoAtual(), 100); // Chama o próximo imediatamente
            return;
        }

        console.log(`Solicitando áudio para parágrafo ${indiceParagrafoAtual}...`);

        // Define o callback para quando o áudio terminar de tocar
        const onAudioEnd = () => {
            isAudioPlaying = false; // Marca que terminou de tocar
            // Não marca isProcessingAudio = false aqui, pois a próxima chamada pode começar
            // Remove destaque do parágrafo que acabou de ser lido
            paragrafoAtual.classList.remove('lendo-agora');

            indiceParagrafoAtual++; // Avança para o próximo índice

            // Verifica se ainda está no modo 'tocando' antes de continuar
            if (estadoLeitura === 'tocando') {
                console.log(`Áudio do parágrafo ${indiceParagrafoAtual - 1} terminado. Agendando leitura do próximo (${indiceParagrafoAtual}).`);
                // Adiciona uma pequena pausa antes de ler o próximo
                setTimeout(() => lerParagrafoAtual(), 600); // Pausa de 600ms
            } else {
                 console.log(`Áudio do parágrafo ${indiceParagrafoAtual - 1} terminado, mas leitura foi pausada/parada.`);
                 // Garante que os botões sejam reabilitados se parou aqui
                 toggleButtons(false);
                 atualizarBotoesNavegacao();
            }
        };

        // Chama a função para obter e tocar o áudio
        tocarAudio(texto, onAudioEnd);
    }


    // *** ESTA É A FUNÇÃO MODIFICADA ***
    // (Cole a função lerTexto da resposta anterior aqui)
    function lerTexto(texto) { // Nome alterado para evitar conflito com a função global que chama o backend
      // Verifica se já existe um áudio tocando ou processando
      if (isAudioPlaying || isProcessingAudio) {
        console.log('Parando áudio/processamento anterior...');
        pararLeitura(false); // Para áudio, mantém índice atual
      }

      isProcessingAudio = true; // Marca que está começando a processar
      toggleButtons(true); // Desabilita botões enquanto busca/toca

      const cacheKey = `${texto}_${vozAtual}_${velocidadeAtual}`;
      const isQuestion = texto.endsWith('?') && texto.length < 50; // Não cachear perguntas curtas

      // Verifica se o áudio está no cache
      if (!isQuestion && audioCache.has(cacheKey)) {
        console.log('Áudio encontrado no cache.');
        return new Promise((resolve, reject) => {
          audioAtual = new Audio(audioCache.get(cacheKey));
          audioAtual.playbackRate = velocidadeAtual; // Aplica velocidade atual
          audioAtual.onended = () => {
            isAudioPlaying = false;
            // isProcessingAudio = false; // Liberado no callback onAudioEnd de lerParagrafoAtual
            resolve(); // Resolve quando termina
          };
          audioAtual.onerror = (e) => {
            console.error('Erro ao reproduzir áudio do cache:', e);
            audioCache.delete(cacheKey); // Remove do cache se deu erro
            isAudioPlaying = false;
            isProcessingAudio = false;
            toggleButtons(false);
            reject(e);
          };
          audioAtual.play().then(() => {
            isAudioPlaying = true;
            isProcessingAudio = false; // Processamento concluído (áudio tocando)
            toggleButtons(false); // Reabilita botões
            atualizarBotoesNavegacao();
          }).catch(reject); // Rejeita se o play falhar
        });
      }

      // Se não está no cache, chama o backend
      console.log('Áudio não encontrado no cache. Chamando backend...');
      const bodyParaBackend = {
        text: texto,
        voice: vozAtual,
        speed: velocidadeAtual
      };
      const backendUrl = 'https://meu-proxy-tts.onrender.com/synthesize'; // URL do backend

      return fetch(backendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyParaBackend)
      })
      .then(res => {
        if (!res.ok) {
           return res.json().catch(() => null).then(errData => {
              throw new Error(errData?.error || `Erro do backend: ${res.status} ${res.statusText}`);
           });
        }
        return res.json();
      })
      .then(data => {
        if (data.audioContent) {
          const audioSrc = "data:audio/mp3;base64," + data.audioContent;
          if (!isQuestion) {
               audioCache.set(cacheKey, audioSrc); // Armazena no cache
               console.log('Áudio adicionado ao cache.');
          }
          return new Promise((resolve, reject) => {
            audioAtual = new Audio(audioSrc);
            // A velocidade já foi definida na API, mas podemos ajustar levemente se necessário
            // audioAtual.playbackRate = velocidadeAtual;
            audioAtual.onended = () => {
              isAudioPlaying = false;
              // isProcessingAudio = false; // Liberado no callback onAudioEnd de lerParagrafoAtual
              resolve();
            };
            audioAtual.onerror = (e) => {
              console.error('Erro ao carregar/reproduzir áudio do backend:', e);
              isAudioPlaying = false;
              isProcessingAudio = false;
              toggleButtons(false);
              reject(e);
            };
            audioAtual.play().then(() => {
              isAudioPlaying = true;
              isProcessingAudio = false; // Processamento concluído
              toggleButtons(false);
              atualizarBotoesNavegacao();
              console.log('Áudio do backend reproduzido.');
            }).catch(reject); // Rejeita se o play falhar
          });
        } else {
          throw new Error("Resposta do backend inválida (sem audioContent)");
        }
      })
      .catch(e => {
        // Captura erros de rede ou da API
        alert(`Erro ao obter áudio do servidor: ${e.message}`);
        console.error("Erro na função tocarAudioBackend:", e);
        isAudioPlaying = false;
        isProcessingAudio = false;
        toggleButtons(false); // Garante reabilitação dos botões
        atualizarBotoesNavegacao();
        return Promise.reject(e); // Rejeita a promessa para parar a sequência
      });
    }

    // Adaptação da função `tocarAudio` para usar a nova `tocarAudioBackend`
    // A função `lerParagrafoAtual` chamará esta `tocarAudio` que por sua vez chama `tocarAudioBackend`
    async function tocarAudio(texto, onEndedCallback) {
        try {
            // Chama a função que interage com o backend e retorna uma promessa
            await lerTexto(texto); // Usa a função renomeada/adaptada que chama o backend
            // Se a promessa resolver (áudio tocou até o fim), chama o callback
            if (onEndedCallback) {
                onEndedCallback();
            }
        } catch (error) {
            // Se a promessa for rejeitada (erro de rede, de reprodução, etc.)
            console.error("Falha ao tocar áudio:", error);
            // Para a leitura para evitar loops de erro
            pararLeitura(false);
            // Poderia tentar novamente ou apenas parar
        }
    }


    // --- Fim das Modificações ---

}); // Fecha o DOMContentLoaded