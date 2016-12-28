//
// baseAspectX/baseAspectY: 生成するツリーマップ絶対のアスペクト比
//

function TreeMap(baseAspectX, baseAspectY){

    let self = {

        // 初期化
        init: function() {

        },

        // キャッシュされたバイナリツリーを得る
        // キャッシュは fileTree 内部に直に保持される
        getDivTree: function(fileTree) {

            // 上位から2階層分のキャッシュを作っていくので，ここにくるのは最上位の時のみ
            if (!fileTree.treeMapCache) {
                fileTree.treeMapCache = {
                    areas: null,
                    rect: [0, 0, baseAspectX, baseAspectY]
                };
            }

            // area が未生成の場合，ここで生成
            if (!fileTree.treeMapCache.areas) {
                let divTree = self.makeDivTree(fileTree.children);

                let areas = {};
                let baseRect = fileTree.treeMapCache.rect;
                self.divideRects(divTree, areas, baseRect);

                fileTree.treeMapCache.areas = areas;
                for (let key in areas) {
                    let r = areas[key];

                    // 子階層に縦横比を伝える
                    fileTree.children[key].treeMapCache = {
                        rect: [0, 0, r[2] - r[0], r[3] - r[1]],
                        areas: null
                    };

                    // 縦横それぞれ0 から 1.0 に正規化して保存
                    areas[key][0] /= baseRect[2] - baseRect[0];
                    areas[key][1] /= baseRect[3] - baseRect[1];
                    areas[key][2] /= baseRect[2] - baseRect[0];
                    areas[key][3] /= baseRect[3] - baseRect[1];
                }
            }
            return fileTree.treeMapCache;
        },

        // tree からバイナリツリーを作る
        // このバイナリツリーはあるフォルダの中のファイルの分割方法を表す．
        // このバイナリツリーは各ノードにおける左右の大きさ（ファイル容量の合計）
        // がなるべくバランスするようにしてある．これによってタイルのアスペクト比
        // が小さくなる･･･ と思う
        makeDivTree: function(tree) {
            let keys = Object.keys(tree);

            // 空ディレクトリ or 容量0のファイルははずしておかないと無限ループする
            keys = keys.filter(function(key) {
                return !(tree[key].size < 1);
            });

            // tree 直下のファイル/ディレクトリのサイズでソート
            keys.sort(function(a, b) {
                let sizeA = tree[a].size;
                let sizeB = tree[b].size;
                if (sizeA > sizeB) return -1;
                if (sizeA < sizeB) return 1;
                return 0;
            });

            // 再帰的にツリーを作成
            // 渡された node の中身を書き換える必要があるので注意
            function makeDivNode(node, fileNames, fileInfo) {

                // 末端
                if (fileNames.length <= 1) {
                    node.size = fileInfo[fileNames[0]].size;
                    node.key = fileNames[0];
                    node.children = null;
                    node.fileNode = fileInfo[fileNames[0]];
                    return;
                }

                let left = [];
                let right = [];
                let leftSize = 0;
                let rightSize = 0;

                // ファイルネームは大きいものから降順にソートされてる
                for (let fileName of fileNames) {
                    // 左右のうち，現在小さい方に加えることでバランスさせる
                    if (leftSize < rightSize) {
                        left.push(fileName);
                        leftSize += fileInfo[fileName].size;
                    }
                    else{
                        right.push(fileName);
                        rightSize += fileInfo[fileName].size;
                    }
                }

                node.size = leftSize + rightSize;
                node.children = [{},{}];
                node.key = "";
                node.fileNode = null;

                makeDivNode(node.children[0], left, fileInfo);
                makeDivNode(node.children[1], right, fileInfo);
            }

            let divTree = {};
            makeDivNode(divTree, keys, tree);
            return divTree;
        },


        // バイナリツリーから矩形のリストを再帰的に作成する
        // divNode: バイナリツリーのノード
        // divided: 分割結果の矩形のハッシュ
        // rect: 分割対象の矩形．これを binNode に従い再帰的に分割
        divideRects: function(divNode, divided, rect) {

            if (!divNode.children) {
                divided[divNode.key] = rect;
                return;
            }
            
            let left = rect[0];
            let top = rect[1];
            let right = rect[2];
            let bottom = rect[3];
            let width = right - left;
            let height = bottom - top;
            let ratio = 
                1.0 * 
                divNode.children[0].size / 
                (divNode.children[0].size + divNode.children[1].size);

            // 長い辺の方を分割
            let result = 
                (width * 1.02 > height) ?   // ラベルを考慮して少しだけ縦長に
                [
                    [left, top, left + width*ratio, bottom],
                    [left + width*ratio, top, right, bottom],
                ] :
                [
                    [left, top, right, top + height*ratio],
                    [left, top + height*ratio, right, bottom],
                ];
            self.divideRects(divNode.children[0], divided, result[0]);
            self.divideRects(divNode.children[1], divided, result[1]);

        },

        // 描画領域の作成
        createTreeMap: function(fileTree, baseWidth, baseHeight, clipRect) {

            let wholeAreas = [];
            let parentAreas = [];
            let cache = self.getDivTree(fileTree);
            let curLevelNodes = [];

            for (let key in cache.areas) {
                let b = cache.areas[key];
                let r = [b[0]*baseWidth, b[1]*baseHeight, b[2]*baseWidth, b[3]*baseHeight];
                // 範囲外なら，これ以上は探索しない
                if (r[0] > clipRect[2] || r[2] < clipRect[0] || 
                    r[1] > clipRect[3] || r[3] < clipRect[1]) {
                    continue;
                }
                parentAreas.push({
                    key: key,
                    rect: r,
                    level: 0
                });
                curLevelNodes.push({
                    fileNode: fileTree.children[key],
                    rect: r
                });
            }

            wholeAreas = wholeAreas.concat(parentAreas);


            for (let j = 1; j < 100; j++) {
                let areas = [];
                let nextLevelNodes = [];
                for (let n of curLevelNodes) {
                    if (n.fileNode.children) {
                        let r = [
                            n.rect[0] + 10,
                            n.rect[1] + 30,
                            n.rect[2] - 10,
                            n.rect[3] - 10,
                        ];

                        // 範囲外なら，これ以上は探索しない
                        if (r[0] > clipRect[2] || r[2] < clipRect[0] || 
                            r[1] > clipRect[3] || r[3] < clipRect[1]) {
                            continue;
                        }

                        // 一定以上の大きさなら探索
                        let width = r[2] - r[0];
                        let height = r[3] - r[1];
                        if (width > 40 && height > 40){

                            let cache = self.getDivTree(n.fileNode);
                            for (let key in cache.areas) {
                                let br = cache.areas[key];
                                let rr = [
                                    r[0]+br[0]*width, 
                                    r[1]+br[1]*height, 
                                    r[0]+br[2]*width, 
                                    r[1]+br[3]*height
                                ];

                                nextLevelNodes.push({
                                    fileNode: n.fileNode.children[key],
                                    rect: rr
                                });

                                areas.push({
                                    key: key,
                                    rect: rr,
                                    level: j
                                });
                            }
                        }
                    }
                }
                curLevelNodes = nextLevelNodes;

                // 新規追加エリアがないので抜ける
                if (areas.length == 0) {
                    break;
                }
                wholeAreas = wholeAreas.concat(areas);
                parentAreas = areas;
            }

            return wholeAreas;

        }
    };

    // 初期化
    self.init();
    return self;

}


module.exports = TreeMap;
