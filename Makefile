PACKAGE_NAME := $(shell basename $(shell pwd))
PACKAGE_VERSION := $(shell git describe --tags --abbrev=0)

mk-wasm:
	cd ./html-rewriter-wasm; make dist

dist: mk-wasm
	cp ./html-rewriter-wasm/html_rewriter* ./vendor 
	cp ./html-rewriter-wasm/asyncify.js ./vendor