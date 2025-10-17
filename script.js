document.addEventListener('DOMContentLoaded', () => {
    // Cole sua Chave de API do Google Cloud aqui.
    const SUA_CHAVE_API = 'AIzaSyCZncgfC5xGjvezIUled31DKe4xnqVDKDs';

    const cabecalho = document.querySelector('header');
    const fileInput = document.getElementById('file-input');
    const areaLeitura = document.getElementById('conteudo-leitura');

    // Variáveis de estado do player de áudio
    let indiceParagrafoAtual = 0;
    let paragrafosDoTexto = [];
    let estadoLeitura = 'parado';
    let audioAtual = null;

    // Eventos principais
    fileInput.addEventListener('change', handleFileSelect);
    areaLeitura.addEventListener('click', iniciarLeituraDePontoEspecifico);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        areaLeitura.innerHTML = `<p class="aviso">Carregando e processando o arquivo...</p>`;
        
        if (file.name.endsWith('.txt')) {
            handleTxtFile(file);
        } else if (file.name.endsWith('.pdf')) {
            handlePdfFile(file);
        } else {
            areaLeitura.innerHTML = `<p class="aviso">Formato de arquivo não suportado. Por favor, escolha .txt ou .pdf.</p>`;
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

    function exibirTexto(texto) {
        pararLeitura(true);
        areaLeitura.innerHTML = '';
        
        const painelControleAntigo = document.getElementById('player-container');
        if (painelControleAntigo) painelControleAntigo.remove();

        const playerHtml = `
            <div id="player-container" class="player-controls">
                <button id="play-pause-btn" class="player-button" title="Tocar / Pausar">▶️</button>
                <button id="stop-btn" class="player-button" title="Parar">⏹️</button>
            </div>`;
        cabecalho.insertAdjacentHTML('beforeend', playerHtml);
        
        document.getElementById('play-pause-btn').addEventListener('click', tocarPausarLeitura);
        document.getElementById('stop-btn').addEventListener('click', () => pararLeitura(true));

        const paragrafos = texto.split('\n').filter(p => p.trim() !== '');
        paragrafos.forEach(p_texto => {
            const p = document.createElement('p');
            p.className = 'paragrafo';
            p.textContent = p_texto;
            areaLeitura.appendChild(p);
        });
        paragrafosDoTexto = areaLeitura.querySelectorAll('.paragrafo');
    }

    function iniciarLeituraDePontoEspecifico(event) {
        const paragrafoClicado = event.target.closest('.paragrafo');
        if (!paragrafoClicado) return;

        const novoIndice = Array.from(paragrafosDoTexto).indexOf(paragrafoClicado);

        if (novoIndice !== -1) {
            pararLeitura(true);
            indiceParagrafoAtual = novoIndice;
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
            if (audioAtual && audioAtual.paused) {
                audioAtual.play();
            } else {
                lerProximoParagrafo();
            }
        }
    }

    function pausarLeitura() {
        if (audioAtual) audioAtual.pause();
        estadoLeitura = 'pausado';
        document.getElementById('play-pause-btn').innerHTML = '▶️';
    }

    function pararLeitura(resetarIndice = false) {
        if (audioAtual) {
            audioAtual.pause();
            audioAtual.onended = null;
            audioAtual.src = '';
            audioAtual = null;
        }

        const paragrafoLendo = document.querySelector('.lendo-agora');
        if (paragrafoLendo) {
            paragrafoLendo.classList.remove('lendo-agora');
        }

        estadoLeitura = 'parado';
        const btn = document.getElementById('play-pause-btn');
        if (btn) btn.innerHTML = '▶️';

        if(resetarIndice){
            indiceParagrafoAtual = 0;
        }
    }

    // --- LÓGICA DE LEITURA CONTÍNUA CORRIGIDA ---
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
            indiceParagrafoAtual++; // Avança para o próximo parágrafo
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
        try {
            const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${SUA_CHAVE_API}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input: { text: texto },
                    voice: { languageCode: 'pt-BR', name: 'pt-BR-Neural2-B' },
                    audioConfig: { audioEncoding: 'MP3' }
                })
            });
            const data = await response.json();
            if (data.audioContent) {
                audioAtual = new Audio('data:audio/mp3;base64,' + data.audioContent);
                audioAtual.onended = onEndedCallback; // AQUI ESTÁ A "PONTE" PARA O PRÓXIMO PARÁGRAFO
                audioAtual.play();
            } else {
                console.error('Erro na API do Google:', data);
                alert('Não foi possível gerar o áudio.');
                pararLeitura(true);
            }
        } catch (error) {
            console.error('Erro ao chamar a API:', error);
            alert('Ocorreu um erro ao tentar gerar o áudio.');
            pararLeitura(true);
        }
    }
});