const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Land System Tests", function () {
    let ownable, landRegistry, landToken, marketplace;
    let owner, user1, user2, validator1, validator2, validator3;
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    this.timeout(50000);

    beforeEach(async function () {
        try {
            const signers = await ethers.getSigners();
            [owner, user1, user2, validator1, validator2, validator3] = signers;

            // 1. Déploiement d'Ownable
            console.log("Déploiement de Ownable...");
            const Ownable = await ethers.getContractFactory("Ownable");
            ownable = await Ownable.deploy();
            await ownable.waitForDeployment();

            // 2. Déployer un proxy pour l'adresse de LandToken
            const proxyAddress = await owner.getAddress();

            // 3. Déployer LandRegistry avec l'adresse proxy
            console.log("Déploiement de LandRegistry...");
            const LandRegistry = await ethers.getContractFactory("LandRegistry");
            landRegistry = await LandRegistry.deploy(proxyAddress);
            await landRegistry.waitForDeployment();
            const landRegistryAddress = await landRegistry.getAddress();

            // 4. Déployer LandToken avec l'adresse de LandRegistry
            console.log("Déploiement de LandToken...");
            const LandToken = await ethers.getContractFactory("LandToken");
            landToken = await LandToken.deploy(landRegistryAddress);
            await landToken.waitForDeployment();
            const landTokenAddress = await landToken.getAddress();

            // 5. Redéployer LandRegistry avec la vraie adresse de LandToken
            console.log("Redéploiement de LandRegistry avec l'adresse finale de LandToken...");
            landRegistry = await LandRegistry.deploy(landTokenAddress);
            await landRegistry.waitForDeployment();

            // 6. Déploiement de LandTokenMarketplace
            console.log("Déploiement de LandTokenMarketplace...");
            const LandTokenMarketplace = await ethers.getContractFactory("LandTokenMarketplace");
            marketplace = await LandTokenMarketplace.deploy(landTokenAddress);
            await marketplace.waitForDeployment();

            // 7. Configuration des validateurs sur le nouveau LandRegistry
            console.log("Configuration des validateurs...");
            await landRegistry.connect(owner).addValidator(validator1.address, 0);
            await landRegistry.connect(owner).addValidator(validator2.address, 1);
            await landRegistry.connect(owner).addValidator(validator3.address, 2);

        } catch (error) {
            console.error("Erreur lors du déploiement:", error);
            throw error;
        }
    });


    describe("1. Ownable Tests", function () {
        it("Doit avoir le bon propriétaire initial", async function () {
            expect(await ownable.owner()).to.equal(owner.address);
        });

        it("Ne doit pas permettre le transfert à l'adresse zéro", async function () {
            await expect(
                ownable.connect(owner).transferOwnership(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(ownable, "OwnableInvalidOwner");
        });
    });

    describe("2. LandRegistry Tests", function () {
        it("Doit permettre d'enregistrer et valider un terrain", async function () {
            // Enregistrer le terrain
            const tx = await landRegistry.connect(user1).registerLand(
                "Paris",
                1500,
                10,
                ethers.parseEther("500"),
                "QmWmyoMoctfbAaiEs2G4bNi1KxatgFfJw47y36p2uUd3Yr"
            );
            await tx.wait();

            // Valider le terrain
            await landRegistry.connect(validator1).validateLand(1, "QmValidationCID1", true);
            await landRegistry.connect(validator2).validateLand(1, "QmValidationCID2", true);
            await landRegistry.connect(validator3).validateLand(1, "QmValidationCID3", true);

            const [isTokenized, status, availableTokens, pricePerToken] = await landRegistry.getLandDetails(1);
            expect(status).to.equal(1); // ValidationStatus.Valide
            expect(availableTokens).to.equal(10);
            expect(pricePerToken).to.equal(ethers.parseEther("500"));
        });
    });

    describe("3. LandToken Tests", function () {
        let landId;

        beforeEach(async function () {
            // Enregistrer le terrain
            const tx = await landRegistry.connect(user1).registerLand(
                "Nice",
                1500,
                10,
                ethers.parseEther("500"),
                "QmWmyoMoctfbAaiEs2G4bNi1KxatgFfJw47y36p2uUd3Yr"
            );
            await tx.wait();
            landId = 1;

            // Valider le terrain par tous les validateurs
            await landRegistry.connect(validator1).validateLand(landId, "QmValidationCID1", true);
            await landRegistry.connect(validator2).validateLand(landId, "QmValidationCID2", true);
            await landRegistry.connect(validator3).validateLand(landId, "QmValidationCID3", true);

            // Vérifier le statut de validation
            const [, status] = await landRegistry.getLandDetails(landId);
            expect(status).to.equal(1); // ValidationStatus.Valide
        });

        it("Doit permettre la tokenisation et le minting", async function () {
            // Tokeniser le terrain
            await landToken.tokenizeLand(landId);

            // Vérifier la tokenisation
            const [isTokenized] = await landRegistry.getLandDetails(landId);
            expect(isTokenized).to.be.true;

            // Minter un token
            await landToken.connect(user1).mintToken(landId, {
                value: ethers.parseEther("500")
            });

            // Vérifier le propriétaire du token
            expect(await landToken.ownerOf(1)).to.equal(user1.address);
        });
    });

    describe("4. LandTokenMarketplace Tests", function () {
        let landId, tokenId;

        beforeEach(async function () {
            // Enregistrer le terrain
            const tx = await landRegistry.connect(user1).registerLand(
                "Bordeaux",
                1500,
                10,
                ethers.parseEther("500"),
                "QmWmyoMoctfbAaiEs2G4bNi1KxatgFfJw47y36p2uUd3Yr"
            );
            await tx.wait();
            landId = 1;

            // Valider le terrain
            await landRegistry.connect(validator1).validateLand(landId, "QmValidationCID1", true);
            await landRegistry.connect(validator2).validateLand(landId, "QmValidationCID2", true);
            await landRegistry.connect(validator3).validateLand(landId, "QmValidationCID3", true);

            // Vérifier la validation
            const [, status] = await landRegistry.getLandDetails(landId);
            expect(status).to.equal(1); // ValidationStatus.Valide

            // Tokeniser le terrain
            await landToken.connect(owner).tokenizeLand(landId);

            // Minter un token
            await landToken.connect(user1).mintToken(landId, {
                value: ethers.parseEther("500")
            });
            tokenId = 1;
        });

        it("Doit permettre de lister et acheter un token", async function () {
            const listingPrice = ethers.parseEther("1000");

            // Approuver le marketplace
            await landToken.connect(user1).approve(await marketplace.getAddress(), tokenId);

            // Lister le token
            await marketplace.connect(user1).listToken(tokenId, listingPrice);

            // Vérifier le listing
            const listing = await marketplace.listings(tokenId);
            expect(listing.isActive).to.be.true;
            expect(listing.price).to.equal(listingPrice);

            // Acheter le token
            await marketplace.connect(user2).buyToken(tokenId, {
                value: listingPrice
            });

            // Vérifier le nouveau propriétaire
            expect(await landToken.ownerOf(tokenId)).to.equal(user2.address);
        });
    });
});